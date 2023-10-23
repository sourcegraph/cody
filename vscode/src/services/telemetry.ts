import * as vscode from 'vscode'

import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { TelemetryEventProperties, TelemetryService } from '@sourcegraph/cody-shared/src/telemetry'
import { EventLogger, ExtensionDetails } from '@sourcegraph/cody-shared/src/telemetry/EventLogger'

import { version as packageVersion } from '../../package.json'
import { logDebug } from '../log'
import { getOSArch } from '../os'

import { localStorage } from './LocalStorageProvider'

export let eventLogger: EventLogger | null = null
let globalAnonymousUserID: string

const { platform, arch } = getOSArch()

export const extensionDetails: ExtensionDetails = {
    ide: 'VSCode',
    ideExtensionType: 'Cody',
    platform: platform ?? 'browser',
    arch,
    // Prefer the runtime package json over the version that is inlined during build times. This
    // way we will be able to include pre-release builds that are published with a different version
    // identifier.
    version: vscode.extensions.getExtension('sourcegraph.cody-ai')?.packageJSON?.version ?? packageVersion,
}

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
            return
        }
    }

    const { anonymousUserID, created } = await localStorage.anonymousUserID()
    globalAnonymousUserID = anonymousUserID

    const serverEndpoint = localStorage?.getEndpoint() || config.serverEndpoint

    if (!eventLogger) {
        eventLogger = new EventLogger(serverEndpoint, extensionDetails, config)
        if (created) {
            logEvent('CodyInstalled', undefined, {
                hasV2Event: true, // Created in src/services/telemetryV2.ts
            })
        } else {
            logEvent('CodyVSCodeExtension:CodySavedLogin:executed', undefined, {
                hasV2Event: true, // Created in src/services/telemetryV2.ts
            })
        }
        return
    }
    eventLogger?.onConfigurationChange(serverEndpoint, extensionDetails, config)
}

/**
 * Log a telemetry event using the legacy event-logging mutations.
 *
 * DEPRECATED: Callsites should ALSO record an event using services/telemetryV2
 * as well and indicate this has happened, for example:
 *
 *   logEvent(name, properties, { hasV2Event: true })
 *   telemetryRecorder.recordEvent(...)
 *
 * In the future, all usages of TelemetryService will be removed in
 * favour of the new libraries. For more information, see:
 * https://docs.sourcegraph.com/dev/background-information/telemetry
 *
 * PRIVACY: Do NOT include any potentially private information in `properties`. These properties may
 * get sent to analytics tools, so must not include private information, such as search queries or
 * repository names.
 *
 * @param eventName The name of the event.
 * @param properties Event properties. Do NOT include any private information, such as full URLs
 * that may contain private repository names or search queries.
 */
function logEvent(eventName: string, properties?: TelemetryEventProperties, opts?: { hasV2Event: boolean }): void {
    logDebug(
        `logEvent${eventLogger === null || process.env.CODY_TESTING === 'true' ? ' (telemetry disabled)' : ''}`,
        eventName,
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
 *
 * DEPRECATED: Callsites should ALSO record an event using services/telemetryV2
 * as well and indicate this has happened, for example:
 *
 *   telemetryService.logEvent(name, properties, { hasV2Event: true })
 *   telemetryRecorder.recordEvent(...)
 *
 * In the future, all usages of TelemetryService will be removed in
 * favour of the new libraries. For more information, see:
 * https://docs.sourcegraph.com/dev/background-information/telemetry
 *
 * If using the new client, the old logging call should indicate a new event is
 * also instrumented:
 *
 *   logEvent(name, properties, { hasV2Event: true })
 */
export const telemetryService: TelemetryService = {
    log(eventName, properties, opts) {
        logEvent(eventName, properties, opts)
    },
}
