import { CallbackTelemetryProcessor } from '@sourcegraph/telemetry'
import { logDebug } from '../logger'
import {
    NoOpTelemetryRecorderProvider,
    type TelemetryRecorder,
    type TelemetryRecorderProvider,
} from './TelemetryRecorderProvider'

const debugLogLabel = 'telemetry-v2'

export let telemetryRecorderProvider: TelemetryRecorderProvider | undefined

/**
 * Recorder for recording telemetry events in the new telemetry framework:
 * https://sourcegraph.com/docs/dev/background-information/telemetry
 *
 * See GraphQLTelemetryExporter to learn more about how events are exported
 * when recorded using the new recorder.
 *
 * The default recorder throws an error if it is used before initialization
 * via createOrUpdateTelemetryRecorderProvider.
 *
 * DO NOT USE from webviews. Use the {@link useTelemetryRecorder} hook instead.
 */
export let telemetryRecorder: TelemetryRecorder = new NoOpTelemetryRecorderProvider().getRecorder([
    new CallbackTelemetryProcessor(() => {
        if (!process.env.VITEST) {
            throw new Error('telemetry-v2: recorder used before initialization')
        }
    }),
])

export function updateGlobalTelemetryInstances(
    updatedProvider: TelemetryRecorderProvider & { noOp?: boolean }
): void {
    telemetryRecorderProvider?.unsubscribe()
    telemetryRecorderProvider = updatedProvider
    telemetryRecorder = updatedProvider.getRecorder([
        // Log all events in debug for reference.
        new CallbackTelemetryProcessor(event => {
            logDebug(
                debugLogLabel,
                `recordEvent${updatedProvider.noOp ? ' (no-op)' : ''}: ${event.feature}/${event.action}`,
                {
                    verbose: {
                        parameters: event.parameters,
                        timestamp: event.timestamp,
                    },
                }
            )
        }),
    ])
}
