import * as vscode from 'vscode'

import { TelemetryService } from '@sourcegraph/cody-shared/src/telemetry'

import { OnboardingExperimentArm } from '../chat/protocol'
import { logDebug } from '../log'

import { localStorage } from './LocalStorageProvider'

// The fraction of users to allocate to the simplified onboarding treatment.
// This should be between 0 (no users) and 1 (all users).
const SIMPLIFIED_ARM_ALLOCATION = 0

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

let telemetryService: TelemetryService | undefined
let selection: SelectedArm | undefined

// Tries to load an override for the onboarding experiment arm based on an
// undocumented configuration property. Use this for testing and development.
function loadOverrideSelection(): SelectedArm | undefined {
    const config = vscode.workspace.getConfiguration()
    return config.has('testing.simplified-onboarding')
        ? { arm: OnboardingExperimentArm.Simplified, excludeFromExperiment: true, setByTestingOverride: true }
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const store = JSON.parse(storedSpec)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        arm = store?.arm
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        excludeFromExperiment = !!store?.excludeFromExperiment
    } catch {
        // Storage is corrupt because it is not valid JSON.
        return new Error(`storage present but not JSON: ${storedSpec}`)
    }
    if (typeof arm === 'number' && OnboardingExperimentArm.MinValue <= arm && arm <= OnboardingExperimentArm.MaxValue) {
        return {
            arm,
            excludeFromExperiment,
            setByTestingOverride: false,
        }
    }
    // Storage is corrupt: it is JSON but properties aren't what we expect
    return new Error(`storage present but properties invalid: ${storedSpec}`)
}

// Picks a new selection but does not cache it to local storage. We cache on
// exposure so unexposed users can be allocated if experiment weights change
// in later versions.
function pickSelection(excludeFromExperiment: boolean): SelectedArm {
    const arm =
        Math.random() < SIMPLIFIED_ARM_ALLOCATION ? OnboardingExperimentArm.Simplified : OnboardingExperimentArm.Classic
    return { arm, excludeFromExperiment, setByTestingOverride: false }
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
    await localStorage.set(
        ONBOARDING_EXPERIMENT_STORAGE_KEY,
        JSON.stringify({ arm: selection.arm, excludeFromExperiment: selection.excludeFromExperiment })
    )
}

export function pickArm(useThisTelemetryService: TelemetryService): OnboardingExperimentArm {
    telemetryService = useThisTelemetryService

    // Try to apply an override for testing.
    const overrideSelection = loadOverrideSelection()
    if (overrideSelection) {
        logDebug(
            'simplified-onboarding',
            'user override onboarding experiment arm selection',
            JSON.stringify(overrideSelection)
        )
        selection = overrideSelection
        return overrideSelection.arm
    }

    // `pickArm` is called repeatedly so we memoize the result. Return the
    // arm cached in memory, if present.
    if (selection?.arm !== undefined) {
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

    // This is the first time we are picking an arm. Pick randomly.
    selection = pickSelection(cachedSelection instanceof Error)
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
