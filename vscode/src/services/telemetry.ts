import * as vscode from 'vscode'

import { type Configuration, type ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { type TelemetryEventProperties, type TelemetryService } from '@sourcegraph/cody-shared/src/telemetry'
import { EventLogger, type ExtensionDetails } from '@sourcegraph/cody-shared/src/telemetry/EventLogger'

import { getConfiguration } from '../configuration'
import { logDebug } from '../log'
import { getOSArch } from '../os'
import { version } from '../version'

import { localStorage } from './LocalStorageProvider'

let eventLogger: EventLogger | null = null
let telemetryLevel: 'all' | 'off' | 'agent' = 'off'
let globalAnonymousUserID: string

const { platform, arch } = getOSArch()

export const getExtensionDetails = (config: Pick<Configuration, 'agentIDE'>): ExtensionDetails => ({
    ide: config.agentIDE ?? 'VSCode',
    ideExtensionType: 'Cody',
    platform: platform ?? 'browser',
    arch,
    version,
})

/**
 * Initializes or configures legacy event-logging globals.
 */
export async function createOrUpdateEventLogger(
    config: ConfigurationWithAccessToken,
    isExtensionModeDevOrTest: boolean
): Promise<void> {
    if (config.telemetryLevel === 'off' || isExtensionModeDevOrTest) {
        // check that CODY_TESTING is not true, because we want to log events when we are testing
        if (process.env.CODY_TESTING !== 'true') {
            eventLogger = null
            telemetryLevel = 'off'
            return
        }
    }

    const extensionDetails = getExtensionDetails(config)

    telemetryLevel = config.telemetryLevel

    const { anonymousUserID, created } = await localStorage.anonymousUserID()
    globalAnonymousUserID = anonymousUserID

    const serverEndpoint = localStorage?.getEndpoint() || config.serverEndpoint

    if (!eventLogger) {
        eventLogger = new EventLogger(serverEndpoint, extensionDetails, config)
        if (created) {
            logEvent('CodyInstalled', undefined, {
                hasV2Event: true, // Created in src/services/telemetry-v2.ts
            })
        } else if (!config.isRunningInsideAgent) {
            logEvent('CodyVSCodeExtension:CodySavedLogin:executed', undefined, {
                hasV2Event: true, // Created in src/services/telemetry-v2.ts
            })
        }
        return
    }
    eventLogger?.onConfigurationChange(serverEndpoint, extensionDetails, config)
}

/**
 * Log a telemetry event using the legacy event-logging mutations.
 * @deprecated New callsites should use telemetryRecorder instead. Existing
 * callsites should ALSO record an event using services/telemetry-v2
 * as well and indicate this has happened, for example:
 *
 * logEvent(name, properties, { hasV2Event: true })
 * telemetryRecorder.recordEvent(...)
 *
 * In the future, all usages of TelemetryService will be removed in
 * favour of the new libraries. For more information, see:
 * https://sourcegraph.com/docs/dev/background-information/telemetry
 * @param eventName The name of the event.
 * @param properties Event properties. Do NOT include any private information, such as full URLs
 * that may contain private repository names or search queries.
 *
 * PRIVACY: Do NOT include any potentially private information in `properties`. These properties may
 * get sent to analytics tools, so must not include private information, such as search queries or
 * repository names.
 */
function logEvent(
    eventName: string,
    properties?: TelemetryEventProperties,
    opts?: { hasV2Event?: boolean; agent?: boolean }
): void {
    if (telemetryLevel === 'agent' && !opts?.agent) {
        return
    }

    logDebug(
        `logEvent${eventLogger === null || process.env.CODY_TESTING === 'true' ? ' (telemetry disabled)' : ''}`,
        eventName,
        getExtensionDetails(getConfiguration(vscode.workspace.getConfiguration())).ide,
        JSON.stringify({ properties, opts })
    )
    if (!eventLogger || !globalAnonymousUserID) {
        return
    }
    try {
        eventLogger.log(eventName, globalAnonymousUserID, properties, opts)
    } catch (error) {
        console.error(error)
    }
}

/**
 * telemetryService logs events using the legacy event-logging mutations.
 * @deprecated New callsites should use telemetryRecorder instead. Existing
 * callsites should ALSO record an event using services/telemetry-v2
 * as well and indicate this has happened, for example:
 *
 * logEvent(name, properties, { hasV2Event: true })
 * telemetryRecorder.recordEvent(...)
 *
 * In the future, all usages of TelemetryService will be removed in
 * favour of the new libraries. For more information, see:
 * https://sourcegraph.com/docs/dev/background-information/telemetry
 */
export const telemetryService: TelemetryService = {
    log(eventName, properties, opts) {
        logEvent(eventName, properties, opts)
    },
}

// TODO: Clean up this name mismatch when we move to TelemetryV2
export function logPrefix(ide: 'VSCode' | 'JetBrains' | 'Neovim' | 'Emacs' | undefined): string {
    return ide
        ? {
              VSCode: 'CodyVSCodeExtension',
              JetBrains: 'CodyJetBrainsPlugin',
              Emacs: 'CodyEmacsPlugin',
              Neovim: 'CodyNeovimPlugin',
          }[ide]
        : 'CodyVSCodeExtension'
}
