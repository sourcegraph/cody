import {
    MockServerTelemetryRecorderProvider,
    NoOpTelemetryRecorderProvider,
    TelemetryRecorderProvider,
    clientCapabilities,
    resolvedConfig,
    subscriptionDisposable,
    telemetryRecorder,
    telemetryRecorderProvider,
    updateGlobalTelemetryInstances,
} from '@sourcegraph/cody-shared'
import { TimestampTelemetryProcessor } from '@sourcegraph/telemetry/dist/processors/timestamp'

import type { Disposable } from 'vscode'
import { logDebug } from '../output-channel-logger'
import { localStorage } from './LocalStorageProvider'

const debugLogLabel = 'telemetry-v2'

/**
 * Initializes or configures new event-recording globals, which leverage the
 * new telemetry framework:
 * https://sourcegraph.com/docs/dev/background-information/telemetry
 */
export function createOrUpdateTelemetryRecorderProvider(
    /**
     * Hardcode isExtensionModeDevOrTest to false to test real exports - when
     * true, exports are logged to extension output instead.
     */
    isExtensionModeDevOrTest: boolean
): Disposable {
    return subscriptionDisposable(
        resolvedConfig.subscribe(({ configuration, auth, clientState, isReinstall }) => {
            // Add timestamp processor for realistic data in output for dev or no-op scenarios
            const defaultNoOpProvider = new NoOpTelemetryRecorderProvider([
                new TimestampTelemetryProcessor(),
            ])

            if (configuration.telemetryLevel === 'off') {
                updateGlobalTelemetryInstances(defaultNoOpProvider)
                return
            }

            const initialize = telemetryRecorderProvider === undefined

            /**
             * In testing, send events to the mock server.
             */
            if (process.env.CODY_TESTING === 'true') {
                logDebug(debugLogLabel, 'using mock exporter')
                updateGlobalTelemetryInstances(
                    new MockServerTelemetryRecorderProvider({
                        configuration,
                        clientState,
                    })
                )
            } else if (isExtensionModeDevOrTest) {
                logDebug(debugLogLabel, 'using no-op exports')
                updateGlobalTelemetryInstances(defaultNoOpProvider)
            } else {
                updateGlobalTelemetryInstances(
                    new TelemetryRecorderProvider({ configuration, auth, clientState })
                )
            }

            /**
             * On first initialization, also record some initial events.
             * Skip any init events for Cody Web use case.
             */
            const newAnonymousUser = localStorage.checkIfCreatedAnonymousUserID()
            if (initialize && !clientCapabilities().isCodyWeb) {
                if (newAnonymousUser || isReinstall) {
                    /**
                     * New user
                     */
                    telemetryRecorder.recordEvent(
                        'cody.extension',
                        isReinstall ? 'reinstalled' : 'installed',
                        {
                            billingMetadata: {
                                product: 'cody',
                                category: 'billable',
                            },
                        }
                    )
                } else if (
                    !configuration.isRunningInsideAgent ||
                    configuration.agentHasPersistentStorage
                ) {
                    /**
                     * Repeat user
                     */
                    telemetryRecorder.recordEvent('cody.extension', 'savedLogin')
                }
            }
        })
    )
}

/**
 * Nifty hack from https://stackoverflow.com/questions/54520676/in-typescript-how-to-get-the-keys-of-an-object-type-whose-values-are-of-a-given
 * that collects the keys of an object where the corresponding value is of a
 * given type as a type.
 */
type KeysWithNumericOrBooleanValues<T> = keyof {
    [P in keyof T as T[P] extends number | boolean ? P : never]: P
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
 * https://sourcegraph.com/docs/dev/background-information/telemetry#sensitive-attributes
 * for more details.
 *
 * This is only available as a migration helper - where possible, prefer to use
 * a telemetryRecorder directly instead, and build the parameters at the callsite.
 */
export function splitSafeMetadata<Properties extends { [key: string]: any }>(
    properties: Properties
): {
    metadata: { [key in KeysWithNumericOrBooleanValues<Properties>]: number }
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
                for (const [nestedKey, value] of Object.entries(metadata)) {
                    // We know splitSafeMetadata returns only an object with
                    // numbers as values. Unit tests ensures this property holds.
                    safe[`${key}.${nestedKey}`] = value as number
                }
                // Preserve the entire original value in unsafe
                unsafe[key] = value
                break
            }

            // By default, treat as potentially unsafe.
            default:
                unsafe[key] = value
        }
    }
    return {
        // We know we've constructed an object with only numeric values, so
        // we cast it into the desired type where all the keys with number values
        // are present. Unit tests ensures this property holds.
        metadata: safe as { [key in KeysWithNumericOrBooleanValues<Properties>]: number },
        privateMetadata: unsafe,
    }
}
