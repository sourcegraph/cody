import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import {
    ConsoleTelemetryRecorderProvider,
    MockServerTelemetryRecorderProvider,
    NoOpTelemetryRecorderProvider,
    TelemetryRecorder,
    TelemetryRecorderProvider,
} from '@sourcegraph/cody-shared/src/telemetry-v2/TelemetryRecorderProvider'

import { logDebug } from '../log'

import { localStorage } from './LocalStorageProvider'
import { extensionDetails } from './telemetry'

let telemetryRecorderProvider: TelemetryRecorderProvider | undefined

/**
 * Recorder for recording telemetry events in the new telemetry framework:
 * https://docs.sourcegraph.com/dev/background-information/telemetry
 *
 * The default recorder throws an error if it is used before initialization
 * via createOrUpdateTelemetryRecorderProvider.
 */
export let telemetryRecorder: TelemetryRecorder = new NoOpTelemetryRecorderProvider().getRecorder([
    {
        processEvent: () => {
            throw new Error('telemetry recorder used before initialization')
        },
    },
])

function updateGlobalInstances(provider: TelemetryRecorderProvider): void {
    telemetryRecorderProvider?.complete()
    telemetryRecorderProvider = provider
    telemetryRecorder = provider.getRecorder()
}

export async function createOrUpdateTelemetryRecorderProvider(
    config: ConfigurationWithAccessToken,
    isExtensionModeDevOrTest: boolean
): Promise<void> {
    if (config.telemetryLevel === 'off') {
        updateGlobalInstances(new NoOpTelemetryRecorderProvider())
        return
    }

    const { anonymousUserID, created } = await localStorage.anonymousUserID()

    // In testing, send events to the mock server.
    if (process.env.CODY_TESTING === 'true') {
        logDebug('telemetryV2', 'using mock exporter')
        updateGlobalInstances(new MockServerTelemetryRecorderProvider(extensionDetails, config, anonymousUserID))
        return
    }

    // In dev, log events to console.
    if (isExtensionModeDevOrTest) {
        logDebug('telemetryV2', 'using console exporter')
        updateGlobalInstances(
            new ConsoleTelemetryRecorderProvider(extensionDetails, config, message => logDebug('telemetryV2', message))
        )
        return
    }

    if (telemetryRecorderProvider === undefined) {
        updateGlobalInstances(new TelemetryRecorderProvider(extensionDetails, config, anonymousUserID))
        // Log some additional events on initial configuration of telemetryRecorderProvider
        if (created) {
            telemetryRecorder.recordEvent('cody', 'installed')
        } else {
            telemetryRecorder.recordEvent('cody.savedLogin', 'executed')
        }
    } else {
        updateGlobalInstances(new TelemetryRecorderProvider(extensionDetails, config, anonymousUserID))
    }
}
