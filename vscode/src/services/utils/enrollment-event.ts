import { FeatureFlag } from '@sourcegraph/cody-shared'
import { telemetryRecorder } from '@sourcegraph/cody-shared'
import { localStorage } from '../LocalStorageProvider'

/**
 * Logs the enrollment event for the given feature flag ONCE in user's lifetime
 * based on the feature flag key stored in the local storage.
 * NOTE: Update the `getFeatureFlagEventName` function to add new feature flags.
 * Returns true if the event is logged successfully, false otherwise.
 *
 * @param key The feature flag key.
 * @param isEnabled Whether the user has the feature flag enabled or not.
 */
export function logFirstEnrollmentEvent(key: FeatureFlag, isEnabled: boolean): boolean {
    // Check if the user is enrolled in the experiment or not
    const isEnrolled = localStorage.getEnrollmentHistory(key)
    const eventName = getFeatureFlagEventName(key)

    // If the user is already enrolled or the event name is not found, return early,
    // as we only want to log the enrollment event once in the user's lifetime.
    if (isEnrolled || !eventName) {
        return isEnrolled && !!eventName
    }

    // Log the enrollment event
    const args = { variant: isEnabled ? 'treatment' : 'control' }
    telemetryRecorder.recordEvent(`cody.experiment.${eventName}`, 'enrolled', {
        privateMetadata: args,
    })
    return true
}

/**
 * Gets the feature flag event name corresponding to the given feature flag key.
 * Matches the feature flag key to the corresponding event name. Returns undefined if no match is found.
 * NOTE: Used for logging events for the feature flag.
 */
function getFeatureFlagEventName(key: FeatureFlag): string | undefined {
    switch (key) {
        case FeatureFlag.CodyInteractiveTutorial:
            return 'interactiveTutorial'
        default:
            return undefined
    }
}
