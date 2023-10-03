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
            logEvent('CodyInstalled')
        } else {
            logEvent('CodyVSCodeExtension:CodySavedLogin:executed')
        }
        return
    }
    eventLogger?.onConfigurationChange(serverEndpoint, extensionDetails, config)
}

/**
 * Log a telemetry event.
 *
 * PRIVACY: Do NOT include any potentially private information in `properties`. These properties may
 * get sent to analytics tools, so must not include private information, such as search queries or
 * repository names.
 *
 * @param eventName The name of the event.
 * @param properties Event properties. Do NOT include any private information, such as full URLs
 * that may contain private repository names or search queries.
 */
function logEvent(eventName: string, properties?: TelemetryEventProperties): void {
    logDebug(
        `logEvent${eventLogger === null || process.env.CODY_TESTING === 'true' ? ' (telemetry disabled)' : ''}`,
        eventName,
        JSON.stringify(properties)
    )
    if (!eventLogger || !globalAnonymousUserID) {
        return
    }
    try {
        eventLogger.log(eventName, globalAnonymousUserID, properties)
    } catch (error) {
        console.error(error)
    }
}

export const telemetryService: TelemetryService = {
    log(eventName, properties) {
        logEvent(eventName, properties)
    },
}
