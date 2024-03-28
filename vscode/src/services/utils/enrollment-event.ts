import { FeatureFlag } from '@sourcegraph/cody-shared'
import { localStorage } from '../LocalStorageProvider'
import { telemetryService } from '../telemetry'
import { telemetryRecorder } from '../telemetry-v2'

const hasV2Event = { hasV2Event: true }

/**
 * Logs the enrollment event for the given feature flag ONCE in user's lifetime
 * based on the feature flag key stored in the local storage.
 *
 * @param key The feature flag key.
 * @param isEnabled Whether the user has the feature flag enabled or not.
 */
export function logFirstEnrollmentEvent(key: FeatureFlag, isEnabled: boolean): void {
    // Check if the user is enrolled in the experiment or not
    const isEnrolled = localStorage.getEnrollmentHistory(key)
    const eventName = getFeatureFlagEventName(key as FeatureFlag)

    // If the user is already enrolled or the event name is not found, return early,
    // as we only want to log the enrollment event once in the user's lifetime.
    if (isEnrolled || !eventName) {
        return
    }

    // Log the enrollment event
    const args = { variant: isEnabled ? 'treatment' : 'control' }
    telemetryService.log(`CodyVSCodeExtension:experiment:${eventName}:enrolled`, args, hasV2Event)
    telemetryRecorder.recordEvent('cody.experiment.hoverCommands', 'enrolled', {
        privateMetadata: args,
    })
}

/**
 * Gets the feature flag event name corresponding to the given feature flag key.
 *
 * Matches the feature flag key to the corresponding event name. Returns undefined if no match is found.
 */
function getFeatureFlagEventName(key: FeatureFlag): string | undefined {
    switch (key) {
        case FeatureFlag.CodyHoverCommands:
            return 'hoverCommands'
        default:
            return undefined
    }
}
