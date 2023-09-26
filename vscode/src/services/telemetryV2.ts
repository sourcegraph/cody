import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import {
    BillingCategory,
    BillingProduct,
    EventAction,
    EventFeature,
    MetadataKey,
} from '@sourcegraph/cody-shared/src/telemetry-v2'
import { TelemetryRecorderProvider } from '@sourcegraph/cody-shared/src/telemetry-v2/TelemetryRecorderProvider'
import { TelemetryRecorder } from '@sourcegraph/telemetry'

import { localStorage } from './LocalStorageProvider'
import { extensionDetails } from './telemetry'

let telemetryRecorderProvider: TelemetryRecorderProvider | undefined

/**
 * Get a recorder for recording telemetry events in the new telemetry framework:
 * https://docs.sourcegraph.com/dev/background-information/telemetry
 *
 * A new recorder should generally be retrieved in order to pick up configuration
 * changes.
 */
export function getRecorder():
    | TelemetryRecorder<EventFeature, EventAction, MetadataKey, BillingCategory, BillingProduct>
    | undefined {
    return telemetryRecorderProvider?.getRecorder()
}

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
        const recorder = telemetryRecorderProvider.getRecorder()
        if (created) {
            recorder.recordEvent('cody', 'installed')
        } else {
            recorder.recordEvent('cody.savedLogin', 'executed')
        }
    } else {
        // Stop the existing provider and create a new one entirely.
        telemetryRecorderProvider.complete()
        telemetryRecorderProvider = new TelemetryRecorderProvider(extensionDetails, config, anonymousUserID)
    }
}
