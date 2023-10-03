import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import {
    NoOpTelemetryRecorderProvider,
    TelemetryRecorderProvider,
} from '@sourcegraph/cody-shared/src/telemetry-v2/TelemetryRecorderProvider'

import { localStorage } from './LocalStorageProvider'
import { extensionDetails } from './telemetry'

let telemetryRecorderProvider: TelemetryRecorderProvider | undefined

/**
 * Recorder for recording telemetry events in the new telemetry framework:
 * https://docs.sourcegraph.com/dev/background-information/telemetry
 */
export let telemetryRecorder =
    telemetryRecorderProvider?.getRecorder() || new NoOpTelemetryRecorderProvider().getRecorder()

export async function createOrUpdateTelemetryRecorderProvider(
    config: ConfigurationWithAccessToken,
    isExtensionModeDevOrTest: boolean
): Promise<void> {
    if (config.telemetryLevel === 'off' || isExtensionModeDevOrTest) {
        // check that CODY_TESTING is not true, because we want to log events when we are testing
        if (process.env.CODY_TESTING !== 'true') {
            return
        }
    }

    const { anonymousUserID, created } = await localStorage.anonymousUserID()

    if (telemetryRecorderProvider === undefined) {
        telemetryRecorderProvider = new TelemetryRecorderProvider(extensionDetails, config, anonymousUserID)
        // Update default recorder instance
        telemetryRecorder = telemetryRecorderProvider.getRecorder()
        if (created) {
            telemetryRecorder.recordEvent('cody', 'installed')
        } else {
            telemetryRecorder.recordEvent('cody.savedLogin', 'executed')
        }
    } else {
        // Stop the existing provider and create a new one entirely.
        telemetryRecorderProvider.complete()
        telemetryRecorderProvider = new TelemetryRecorderProvider(extensionDetails, config, anonymousUserID)
    }
}
