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
import { getExtensionDetails } from './telemetry'

let telemetryRecorderProvider: TelemetryRecorderProvider | undefined

/**
 * Recorder for recording telemetry events in the new telemetry framework:
 * https://docs.sourcegraph.com/dev/background-information/telemetry
 *
 * See GraphQLTelemetryExporter to learn more about how events are exported
 * when recorded using the new recorder.
 *
 * The default recorder throws an error if it is used before initialization
 * via createOrUpdateTelemetryRecorderProvider.
 */
export let telemetryRecorder: TelemetryRecorder = new NoOpTelemetryRecorderProvider().getRecorder([
    new CallbackTelemetryProcessor(() => {
        if (!process.env.VITEST) {
            throw new Error('telemetry-v2: recorder used before initialization')
        }
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

const debugLogLabel = 'telemetry-v2'

function updateGlobalInstances(updatedProvider: TelemetryRecorderProvider & { noOp?: boolean }): void {
    telemetryRecorderProvider?.unsubscribe()
    telemetryRecorderProvider = updatedProvider
    telemetryRecorder = updatedProvider.getRecorder([
        // Log all events in debug for reference.
        new CallbackTelemetryProcessor(event => {
            logDebug(
                debugLogLabel,
                `recordEvent${updatedProvider.noOp ? ' (no-op)' : ''}: ${event.feature}/${
                    event.action
                }: ${JSON.stringify({
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
    const extensionDetails = getExtensionDetails(config)

    if (config.telemetryLevel === 'off' || !extensionDetails.ide || extensionDetails.ideExtensionType !== 'Cody') {
        updateGlobalInstances(new NoOpTelemetryRecorderProvider())
        return
    }

    const { anonymousUserID, created: newAnonymousUser } = await localStorage.anonymousUserID()
    const initialize = telemetryRecorderProvider === undefined

    /**
     * In testing, send events to the mock server.
     */
    if (process.env.CODY_TESTING === 'true') {
        logDebug(debugLogLabel, 'using mock exporter')
        updateGlobalInstances(new MockServerTelemetryRecorderProvider(extensionDetails, config, anonymousUserID))
    } else if (isExtensionModeDevOrTest) {
        logDebug(debugLogLabel, 'using no-op exports')
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
        } else if (!config.isRunningInsideAgent) {
            /**
             * Repeat user
             */
            telemetryRecorder.recordEvent('cody.extension', 'savedLogin')
        }
    }
}

/**
 * splitSafeMetadata is a helper for legacy telemetry helpers that accept typed
 * event metadata with arbitrarily-shaped values. It checks the types of the
 * parameters and automatically splits them into two objects:
 *
 * - metadata, with numeric values and boolean values converted into 1 or 0.
 * - privateMetadata, which includes everything else
 *
 * We export privateMetadata has special treatment in Sourcegraph.com, but do
 * not export it in private instances unless allowlisted. See
 * https://docs.sourcegraph.com/dev/background-information/telemetry#sensitive-attributes
 * for more details.
 *
 * This is only available as a migration helper - where possible, prefer to use
 * a telemetryRecorder directly instead, and build the parameters at the callsite.
 */
export function splitSafeMetadata<Properties extends { [key: string]: any }>(
    properties: Properties
): {
    metadata: { [key in keyof Properties]?: number }
    privateMetadata: { [key in keyof Properties]?: any }
} {
    const safe: { [key in keyof Properties]?: number } = {}
    const unsafe: { [key in keyof Properties]?: any } = {}
    for (const key in properties) {
        if (!Object.hasOwn(properties, key)) {
            continue
        }

        const value = properties[key]
        switch (typeof value) {
            case 'number':
                safe[key] = value
                break
            case 'boolean':
                safe[key] = value ? 1 : 0
                break
            case 'object': {
                const { metadata } = splitSafeMetadata(value)
                Object.entries(metadata).forEach(([nestedKey, value]) => {
                    safe[`${key}.${nestedKey}`] = value
                })
                // Preserve the entire original value in unsafe
                unsafe[key] = value
            }

            // By default, treat as potentially unsafe.
            default:
                unsafe[key] = value
        }
    }
    return { metadata: safe, privateMetadata: unsafe }
}
