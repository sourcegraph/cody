import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { EventLogger, ExtensionDetails } from '@sourcegraph/cody-shared/src/telemetry/EventLogger'

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
 * Logs an event.
 *
 * PRIVACY: Do NOT include any potentially private information in this field.
 * These properties get sent to our analytics tools for Cloud, so must not
 * include private information, such as search queries or repository names.
 *
 * @param eventName The name of the event.
 * @param eventProperties The additional argument information.
 * @param publicProperties Public argument information.
 */
export function logEvent(eventName: string, eventProperties?: any, publicProperties?: any): void {
    if (!eventLogger || !globalAnonymousUserID) {
        return
    }
    const argument = {
        ...eventProperties,
        version: packageVersion,
    }
    const publicArgument = {
        ...publicProperties,
        version: packageVersion,
    }
    try {
        debug('EventLogger', eventName, JSON.stringify(argument, null, 2))
        eventLogger.log(eventName, globalAnonymousUserID, argument, publicArgument)
    } catch (error) {
        console.error(error)
    }
}
