import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { LogEventMode } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'
import {
    MockServerTelemetryRecorderProvider,
    NoOpTelemetryRecorderProvider,
    TelemetryRecorder,
    TelemetryRecorderProvider,
} from '@sourcegraph/cody-shared/src/telemetry-v2/TelemetryRecorderProvider'
import { CallbackTelemetryProcessor } from '@sourcegraph/telemetry'

import { logDebug } from '../log'

import { localStorage } from './LocalStorageProvider'
import { extensionDetails } from './telemetry'

let telemetryRecorderProvider: TelemetryRecorderProvider | undefined

/**
 * Recorder for recording telemetry events in the new telemetry framework:
 * https://docs.sourcegraph.com/dev/background-information/telemetry
 *
 * DEPRECATED: Callsites should ALSO record an event using services/telemetryV2
 * as well and indicate this has happened, for example:
 *
 *   logEvent(name, properties, { hasV2Event: true })
 *   telemetryRecorder.recordEvent(...)
 *
 * See GraphQLTelemetryExporter to learn more about how events are exported
 * when recorded using the new recorder.
 *
 * The default recorder throws an error if it is used before initialization
 * via createOrUpdateTelemetryRecorderProvider.
 */
export let telemetryRecorder: TelemetryRecorder = new NoOpTelemetryRecorderProvider().getRecorder([
    new CallbackTelemetryProcessor(() => {
        throw new Error('telemetryV2: recorder used before initialization')
    }),
])

/**
 * For legacy events export, where we are connected to a pre-5.2.0 instance,
 * the current strategy is to manually instrument a callsite the legacy logEvent
 * clients as well, and that will report events directly to dotcom. To avoid
 * duplicating the data, when we are doing a legacy export, we only send events
 * to the connected instance.
 *
 * In the future, when we remove the legacy event-logging clients, we should
 * change this back to 'all' so that legacy instances report events to
 * dotcom as well through the new clients.
 */
const legacyBackcompatLogEventMode: LogEventMode = 'connected-instance-only'

function updateGlobalInstances(updatedProvider: TelemetryRecorderProvider): void {
    telemetryRecorderProvider?.complete()
    telemetryRecorderProvider = updatedProvider
    telemetryRecorder = updatedProvider.getRecorder([
        // Log all events in debug for reference.
        new CallbackTelemetryProcessor(event => {
            logDebug(
                'telemetryV2',
                `recordEvent: ${event.feature}/${event.action}: ${JSON.stringify({
                    parameters: event.parameters,
                })}`
            )
        }),
    ])
}

/**
 * Initializes or configures new event-recording globals, which leverage the
 * new telemetry framework:
 * https://docs.sourcegraph.com/dev/background-information/telemetry
 */
export async function createOrUpdateTelemetryRecorderProvider(
    config: ConfigurationWithAccessToken,
    /**
     * Hardcode isExtensionModeDevOrTest to false to test real exports - when
     * true, exports are logged to extension output instead.
     */
    isExtensionModeDevOrTest: boolean
): Promise<void> {
    if (config.telemetryLevel === 'off') {
        updateGlobalInstances(new NoOpTelemetryRecorderProvider())
        return
    }

    const { anonymousUserID, created: newAnonymousUser } = await localStorage.anonymousUserID()
    const initialize = telemetryRecorderProvider === undefined

    /**
     * In testing, send events to the mock server.
     */
    if (process.env.CODY_TESTING === 'true') {
        logDebug('telemetryV2', 'using mock exporter')
        updateGlobalInstances(new MockServerTelemetryRecorderProvider(extensionDetails, config, anonymousUserID))
    } else if (isExtensionModeDevOrTest) {
        logDebug('telemetryV2', 'using no-op exports')
        updateGlobalInstances(new NoOpTelemetryRecorderProvider())
    } else {
        updateGlobalInstances(
            new TelemetryRecorderProvider(extensionDetails, config, anonymousUserID, legacyBackcompatLogEventMode)
        )
    }

    /**
     * On first initialization, also record some initial events.
     */
    if (initialize) {
        if (newAnonymousUser) {
            /**
             * New user
             */
            telemetryRecorder.recordEvent('cody.extension', 'installed')
        } else {
            /**
             * Repeat user
             */
            telemetryRecorder.recordEvent('cody.extension', 'savedLogin')
        }
    }
}
