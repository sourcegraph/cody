import * as vscode from 'vscode'

import { logDebug } from '../log'

import { localStorage } from './LocalStorageProvider'
import { telemetryService } from './telemetry'

// The fraction of users to allocate to the removed authentication step branch.
// This should be between 0 (no users) and 1 (all users).
const REMOVE_AUTHENTICATION_STEP_BRANCH_ALLOCATION = 0.5

// Note: This string was changed from the initial onboarding experiment to avoid
// previous experiments interfering with the new test.
const ONBOARDING_EXPERIMENT_STORAGE_KEY = 'experiment.onboarding.removeAuthenticationStep'

interface SelectedBranch {
    // Which branch has been selected
    branch: OnboardingExperimentBranch
    // If a user manually overrides the onboarding experiment branch, or storage
    // is corrupt, this flag is set and transmitted with logs so they can be
    // excluded from experiment results.
    excludeFromExperiment: boolean
    // If a user uses the override for testing, we don't persist the selection
    // to local storage
    setByTestingOverride: boolean
}

let selection: SelectedBranch | undefined

// Tries to load an override for the onboarding experiment branch based on an
// undocumented configuration property. Use this for testing and development.
function loadOverrideSelection(): SelectedBranch | undefined {
    const config = vscode.workspace.getConfiguration()
    const override = config.get('cody.testing.removeAuthenticationStep')
    return typeof override === 'boolean'
        ? {
              branch: override
                  ? OnboardingExperimentBranch.RemoveAuthenticationStep
                  : OnboardingExperimentBranch.Control,
              excludeFromExperiment: true,
              setByTestingOverride: true,
          }
        : undefined
}

// Loads the previously selected branch from storage. If storage is present but
// corrupt, returns an error.
function loadCachedSelection(): SelectedBranch | Error | undefined {
    const storedSpec = localStorage.get(ONBOARDING_EXPERIMENT_STORAGE_KEY)
    if (!storedSpec) {
        return undefined
    }
    let branch: unknown
    let excludeFromExperiment: boolean
    try {
        const store = JSON.parse(storedSpec)
        branch = store?.branch
        excludeFromExperiment = !!store?.excludeFromExperiment
    } catch {
        // Storage is corrupt because it is not valid JSON.
        return new Error(`storage present but not JSON: ${storedSpec}`)
    }
    if (typeof branch === 'number' && typeof OnboardingExperimentBranch[branch] !== 'undefined') {
        return {
            branch,
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
function pickSelection(excludeFromExperiment: boolean): SelectedBranch {
    // A non-web UI Kind is necessary to get the simplified onboarding experience
    if (vscode.env.uiKind === vscode.UIKind.Web) {
        return {
            branch: OnboardingExperimentBranch.Control,
            excludeFromExperiment: true,
            setByTestingOverride: false,
        }
    }
    const branch =
        Math.random() < REMOVE_AUTHENTICATION_STEP_BRANCH_ALLOCATION
            ? OnboardingExperimentBranch.RemoveAuthenticationStep
            : OnboardingExperimentBranch.Control
    return { branch, excludeFromExperiment, setByTestingOverride: false }
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
        logDebug('simplified-onboarding', 'not caching experiment branch selected by testing override')
        return
    }
    await localStorage.set(
        ONBOARDING_EXPERIMENT_STORAGE_KEY,
        JSON.stringify({
            branch: selection.branch,
            excludeFromExperiment: selection.excludeFromExperiment,
        })
    )
}

export function pickBranch(): OnboardingExperimentBranch {
    // Try to apply an override for testing.
    const overrideSelection = loadOverrideSelection()
    if (overrideSelection) {
        selection = overrideSelection
        return overrideSelection.branch
    }

    // `pickBranch` is called repeatedly so we memoize the result. Return the
    // branch cached in memory, if present.
    if (selection?.branch !== undefined) {
        return selection.branch
    }

    // Try to load an earlier selection from storage.
    const cachedSelection = loadCachedSelection()
    if (cachedSelection && !(cachedSelection instanceof Error)) {
        logDebug(
            'simplified-onboarding',
            'using cached onboarding experiment branch selection',
            JSON.stringify(cachedSelection)
        )
        selection = cachedSelection
        return selection.branch
    }

    if (cachedSelection instanceof Error) {
        logDebug('simplified-onboarding', 'error loading cached selection', cachedSelection)
    }

    // This is the first time we are picking an branch. Pick randomly.
    selection = pickSelection(cachedSelection instanceof Error)
    logDebug(
        'simplified-onboarding',
        'picked new onboarding experiment branch selection',
        JSON.stringify(selection)
    )
    return selection.branch
}

export async function logExposure(): Promise<void> {
    if (selection?.setByTestingOverride) {
        logDebug('simplified-onboarding', 'not logging exposure for testing override selection')
        return
    }
    await Promise.all([
        telemetryService.log('CodyVSCodeExtension:experiment:removeAuthenticationStep:exposed', {
            branch:
                selection?.branch === OnboardingExperimentBranch.RemoveAuthenticationStep
                    ? 'treatment'
                    : 'control',
            excludeFromExperiment: selection?.excludeFromExperiment,
        }),
        cacheSelection(),
    ])
}

export function resetForTesting(): void {
    selection = undefined
}

export enum OnboardingExperimentBranch {
    Control = 0, // Control
    RemoveAuthenticationStep = 1, // Treatment
}
