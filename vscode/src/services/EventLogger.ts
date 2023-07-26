import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import {
    EventLogger,
    ExtensionDetails,
    TelemetryEventProperties,
} from '@sourcegraph/cody-shared/src/telemetry/EventLogger'

import { version as packageVersion } from '../../package.json'
import { debug } from '../log'

import { LocalStorage } from './LocalStorageProvider'

export let eventLogger: EventLogger | null = null
let globalAnonymousUserID: string

const extensionDetails: ExtensionDetails = { ide: 'VSCode', ideExtensionType: 'Cody' }

export async function createOrUpdateEventLogger(
    config: ConfigurationWithAccessToken,
    localStorage: LocalStorage
): Promise<void> {
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
 * PRIVACY: Do NOT include any potentially private information in `eventProperties`. These
 * properties may get sent to analytics tools, so must not include private information, such as
 * search queries or repository names.
 *
 * @param eventName The name of the event.
 * @param eventProperties Event properties. This may contain private info such as repository
 * names or search queries. If audit logging is enabled, this data is stored on the associated
 * Sourcegraph instance.
 * @param publicProperties Event properties that include only public information. Do NOT include
 * any private information, such as full URLs that may contain private repository names or
 * search queries.
 */
export function logEvent(
    eventName: string,
    eventProperties?: TelemetryEventProperties,
    publicProperties?: TelemetryEventProperties
): void {
    if (!eventLogger || !globalAnonymousUserID) {
        return
    }
    try {
        debug('EventLogger', eventName, eventProperties, publicProperties)
        eventLogger.log(
            eventName,
            globalAnonymousUserID,
            { ...eventProperties, version: packageVersion },
            {
                ...publicProperties,
                version: packageVersion,
            }
        )
    } catch (error) {
        console.error(error)
    }
}
