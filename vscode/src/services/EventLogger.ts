import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { SourcegraphGraphQLAPIClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql'
import { EventLogger } from '@sourcegraph/cody-shared/src/telemetry/EventLogger'

import { version as packageVersion } from '../../package.json'
import { debug } from '../log'

import { LocalStorage } from './LocalStorageProvider'

let eventLoggerGQLClient: SourcegraphGraphQLAPIClient
export let eventLogger: EventLogger | null = null
let anonymousUserID: string

export async function updateEventLogger(
    config: ConfigurationWithAccessToken,
    localStorage: LocalStorage
): Promise<void> {
    const status = await localStorage.setAnonymousUserID()
    anonymousUserID = localStorage.getAnonymousUserID() || ''
    if (!eventLogger || !eventLoggerGQLClient) {
        eventLogger = new EventLogger(eventLoggerGQLClient, config)
        eventLoggerGQLClient = eventLogger.gqlAPIClient
        logEvent(status === 'installed' ? 'CodyInstalled' : 'CodyVSCodeExtension:CodySavedLogin:executed')
        return
    }
    eventLoggerGQLClient.onConfigurationChange(config)
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
    if (!eventLogger || !anonymousUserID) {
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
        eventLogger.log(eventName, anonymousUserID, argument, publicArgument)
    } catch (error) {
        console.error(error)
    }
}
