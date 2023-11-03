import { localStorage } from './LocalStorageProvider'

// Simplified onboarding is the default now. Classic onboarding is still used
// for web, dotcom redirects to vscode://... do not work on web. We also use
// classic if testing.simplified-onboarding: false override is set in user
// settings JSON.

// TODO: Delete this key to clean up storage after 0.16.x.
const ONBOARDING_EXPERIMENT_STORAGE_KEY = 'experiment.onboarding'

// Cleans up the onboarding experiment arm from local storage.
export function cleanUpCachedSelection(): Promise<void> {
    return localStorage.delete(ONBOARDING_EXPERIMENT_STORAGE_KEY)
}
