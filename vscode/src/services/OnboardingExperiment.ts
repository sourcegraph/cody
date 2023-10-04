import * as vscode from 'vscode'

import { TelemetryService } from '@sourcegraph/cody-shared/src/telemetry'

import { OnboardingExperimentArm } from '../chat/protocol'
import { logDebug } from '../log'

import { localStorage } from './LocalStorageProvider'

// Simplified onboarding is the default now. Classic onboarding is still used
// for web, dotcom redirects to vscode://... do not work on web. We also use
// classic if testing.simplified-onboarding: false override is set in user
// settings JSON.

// TODO: Delete this key to clean up storage after 0.16.x.
const ONBOARDING_EXPERIMENT_STORAGE_KEY = 'experiment.onboarding'

interface SelectedArm {
    // Which arm has been selected
    arm: OnboardingExperimentArm
    // If a user manually overrides the onboarding experiment arm, or storage is
    // corrupt, this flag is set and transmitted with logs so they can be
    // excluded from experiment results.
    excludeFromExperiment: boolean
    // If a user uses the override for testing, we don't persist the selection
    // to local storage
    setByTestingOverride: boolean
}

// The JSON we write to local storage.
interface SerializedSelectedArm {
    arm: OnboardingExperimentArm
    excludeFromExperiment: boolean
}

// TODO(dpc): Refactor TelemetryService to be a globalton like the other
// services, instead of catching one that's passed around.
let telemetryService: TelemetryService | undefined
let selection: SelectedArm | undefined

// Tries to load an override for the onboarding experiment arm based on an
// undocumented configuration property. Use this for testing and development.
function loadOverrideSelection(): SelectedArm | undefined {
    const config = vscode.workspace.getConfiguration()
    const override = config.get('testing.simplified-onboarding')
    return typeof override === 'boolean'
        ? {
              arm: override ? OnboardingExperimentArm.Simplified : OnboardingExperimentArm.Classic,
              excludeFromExperiment: true,
              setByTestingOverride: true,
          }
        : undefined
}

// Loads the previously selected arm from storage. If storage is present but
// corrupt, returns an error.
function loadCachedSelection(): SelectedArm | Error | undefined {
    const storedSpec = localStorage.get(ONBOARDING_EXPERIMENT_STORAGE_KEY)
    if (!storedSpec) {
        return undefined
    }
    let arm
    let excludeFromExperiment
    try {
        // Assume local storage stores a format we expect. The catch clause
        // handles any deviations from that.
        const store = JSON.parse(storedSpec) as SerializedSelectedArm
        arm = store.arm
        excludeFromExperiment = !!store?.excludeFromExperiment
    } catch {
        // Storage is corrupt because it is not valid JSON.
        return new Error(`storage present but not JSON: ${storedSpec}`)
    }
    if (typeof arm === 'number' && OnboardingExperimentArm.MinValue <= arm && arm <= OnboardingExperimentArm.MaxValue) {
        return {
            // Ignore the allocated arm from storage and give every user
            // simplified onboarding--even those who were in the control group.
            arm: OnboardingExperimentArm.Simplified,
            // Exclude users who were previously in the control group from the experiment.
            excludeFromExperiment: excludeFromExperiment || arm === OnboardingExperimentArm.Classic,
            setByTestingOverride: false,
        }
    }
    // Storage is corrupt: it is JSON but properties aren't what we expect
    return new Error(`storage present but properties invalid: ${storedSpec}`)
}

// Cache the current selection to local storage. Selections because of a manual
// override for testing are not cached.
async function cacheSelection(): Promise<void> {
    if (selection === undefined) {
        throw new Error('tried to cache selection before picking')
    }
    if (selection.setByTestingOverride) {
        // Don't cache these so QA can remove the test override property and
        // go back to a typical product configuration.
        logDebug('simplified-onboarding', 'not caching experiment arm selected by testing override')
        return
    }
    const blob: SerializedSelectedArm = { arm: selection.arm, excludeFromExperiment: selection.excludeFromExperiment }
    await localStorage.set(ONBOARDING_EXPERIMENT_STORAGE_KEY, JSON.stringify(blob))
}

export function pickArm(useThisTelemetryService: TelemetryService): OnboardingExperimentArm {
    telemetryService = useThisTelemetryService

    // Try to apply an override for testing.
    const overrideSelection = loadOverrideSelection()
    if (overrideSelection) {
        selection = overrideSelection
        return overrideSelection.arm
    }

    // `pickArm` is called repeatedly so we memoize the result. Return the
    // arm cached in memory, if present.
    if (selection?.arm !== undefined) {
        return selection.arm
    }

    // TODO: Port simplified onboarding to web, then delete classic onboarding.
    if (vscode.env.uiKind === vscode.UIKind.Web) {
        selection = { arm: OnboardingExperimentArm.Classic, excludeFromExperiment: true, setByTestingOverride: false }
        return selection.arm
    }

    // Try to load an earlier selection from storage.
    const cachedSelection = loadCachedSelection()
    if (cachedSelection && !(cachedSelection instanceof Error)) {
        logDebug(
            'simplified-onboarding',
            'using cached onboarding experiment arm selection',
            JSON.stringify(cachedSelection)
        )
        selection = cachedSelection
        return selection.arm
    }

    if (cachedSelection instanceof Error) {
        logDebug('simplified-onboarding', 'error loading cached selection', cachedSelection)
    }

    selection = {
        // All non-web users get simplified onboarding now.
        arm: OnboardingExperimentArm.Simplified,
        excludeFromExperiment: cachedSelection instanceof Error,
        setByTestingOverride: false,
    }
    logDebug('simplified-onboarding', 'picked new onboarding experiment arm selection', JSON.stringify(selection))
    return selection.arm
}

export async function logExposure(): Promise<void> {
    if (selection?.setByTestingOverride) {
        logDebug('simplified-onboarding', 'not logging exposure for testing override selection')
        return
    }
    await Promise.all([
        telemetryService?.log('CodyVSCodeExtension:experiment:simplifiedOnboarding:exposed', {
            arm: selection?.arm === OnboardingExperimentArm.Simplified ? 'treatment' : 'control',
            excludeFromExperiment: selection?.excludeFromExperiment,
        }),
        cacheSelection(),
    ])
}

export function resetForTesting(): void {
    telemetryService = undefined
    selection = undefined
}
