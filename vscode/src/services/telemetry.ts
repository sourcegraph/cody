import * as vscode from 'vscode'

import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { FeatureFlag, featureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'
import { isDotCom } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'
import { TelemetryEventProperties, TelemetryService } from '@sourcegraph/cody-shared/src/telemetry'
import { EventLogger, ExtensionDetails } from '@sourcegraph/cody-shared/src/telemetry/EventLogger'

import { version as packageVersion } from '../../package.json'
import { getConfiguration } from '../configuration'
import { logDebug } from '../log'
import { getOSArch } from '../os'

import { localStorage } from './LocalStorageProvider'

export let eventLogger: EventLogger | null = null
let telemetryLevel: 'all' | 'off' | 'agent' = 'off'
let globalAnonymousUserID: string

const { platform, arch } = getOSArch()

const config = getConfiguration(vscode.workspace.getConfiguration())
export const extensionDetails: ExtensionDetails = {
    ide: config.agentIDE ?? 'VSCode',
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
            telemetryLevel = 'off'
            return
        }
    }

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
        } else {
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
 *
 * DEPRECATED: Callsites should ALSO record an event using services/telemetry-v2
 * as well and indicate this has happened, for example:
 *
 * logEvent(name, properties, { hasV2Event: true })
 * telemetryRecorder.recordEvent(...)
 *
 * In the future, all usages of TelemetryService will be removed in
 * favour of the new libraries. For more information, see:
 * https://docs.sourcegraph.com/dev/background-information/telemetry
 *
 * PRIVACY: Do NOT include any potentially private information in `properties`. These properties may
 * get sent to analytics tools, so must not include private information, such as search queries or
 * repository names.
 * @param eventName The name of the event.
 * @param properties Event properties. Do NOT include any private information, such as full URLs
 * that may contain private repository names or search queries.
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
        extensionDetails.ide,
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
 * DEPRECATED: Callsites should ALSO record an event using services/telemetry-v2
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

/**
 * Syncs Cody chat transcripts with Sourcegraph cloud for dotcom endpoints.
 * Checks if there are chat transcripts in local storage that need to be synced,
 * by comparing their last interaction timestamp against the last sync timestamp.
 * Transcripts more recent than the last sync are stringified and logged as events.
 */
export async function syncTranscript(endpoint: string): Promise<void> {
    // Only sync chat transcripts for dotcom endpoints
    if (!isDotCom(endpoint)) {
        return
    }

    const eventName = 'CodyVSCodeExtension:syncChatTranscript'

    try {
        // Skip if feature flag is not avaliable
        const isFeatureEnabled = await featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyChatTranscript)
        if (!isFeatureEnabled) {
            return
        }
        // Skip if there are no chat transcripts available
        const chatFromStore = localStorage.getChatHistory()?.chat
        if (!chatFromStore) {
            return
        }

        // Only sync if the last interaction timestamp is more recent than the last sync time.
        const lastSyncedTimestamp = await localStorage.lastSyncTimestamp()

        // Skip if lastSyncedTimestamp is today's date
        if (new Date(lastSyncedTimestamp).toDateString() === new Date().toDateString()) {
            return
        }

        Object.entries(chatFromStore).forEach(([id, transcript]) => {
            // Convert transcript.lastInteractionTimestamp from timestamp string to number
            const lastInteractionTimestamp = new Date(transcript.lastInteractionTimestamp).getTime()

            if (lastInteractionTimestamp > lastSyncedTimestamp) {
                const eventData = { id, transcript: JSON.stringify(transcript) }
                logEvent(eventName, eventData)
            }
        })
    } catch (error: unknown) {
        logEvent(`${eventName}:failed`, { error: `${error}` })
    }
}
