import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { TelemetryEventProperties } from '@sourcegraph/cody-shared/src/telemetry'
import { EventLogger, ExtensionDetails } from '@sourcegraph/cody-shared/src/telemetry/EventLogger'

import { version as packageVersion } from '../../package.json'
import { debug } from '../log'

import { LocalStorage } from './LocalStorageProvider'

export let eventLogger: EventLogger | null = null
let globalAnonymousUserID: string

const extensionDetails: ExtensionDetails = { ide: 'VSCode', ideExtensionType: 'Cody', version: packageVersion }

export async function createOrUpdateEventLogger(
    config: ConfigurationWithAccessToken,
    localStorage: LocalStorage,
    isExtensionModeDevOrTest: boolean
): Promise<void> {
    if (config.telemetryLevel === 'off' || isExtensionModeDevOrTest) {
        eventLogger = null
        return
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
 *
 * @deprecated Use TelemetryService instead.
 */
export function logEvent(eventName: string, properties?: TelemetryEventProperties): void {
    debug(`logEvent${eventLogger === null ? ' (telemetry disabled)' : ''}`, eventName, JSON.stringify(properties))
    if (!eventLogger || !globalAnonymousUserID) {
        return
    }
    try {
        eventLogger.log(eventName, globalAnonymousUserID, properties)
    } catch (error) {
        console.error(error)
    }
}
