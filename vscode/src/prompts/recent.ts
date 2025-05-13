import { localStorage } from '../services/LocalStorageProvider'

// Constants
const LOCAL_STORAGE_KEY = 'cody-recently-used-prompts'
const MAX_STORED_PROMPTS = 50

/**
 * Get the local storage key for recently used prompts
 */
const getLocalStorageKey = ({
    authStatus,
}: { authStatus: { endpoint: string; username: string } }): string => {
    return `${LOCAL_STORAGE_KEY}:${authStatus.endpoint}:${authStatus.username}`
}

/**
 * Save a recently used prompt ID to local storage
 * @param authStatus Authentication status containing endpoint and username
 * @param id The prompt ID to save
 */
export function saveRecentlyUsedPrompt({
    authStatus,
    id,
}: {
    authStatus: { endpoint: string; username: string }
    id: string
}): Promise<void> {
    // Get existing prompt IDs
    const key = getLocalStorageKey({ authStatus })
    const data = localStorage.get<string>(key)
    let promptIds: string[] = data ? JSON.parse(data) : []

    // Remove the ID if it already exists (to move it to the start)
    promptIds = promptIds.filter(promptId => promptId !== id)

    // Add the ID to the beginning of the array
    promptIds.unshift(id)

    // Truncate the list to max limit
    promptIds = promptIds.slice(0, MAX_STORED_PROMPTS)

    // Save the updated list
    return localStorage.set(key, JSON.stringify(promptIds))
}

/**
 * Get the list of recently used prompt IDs
 * @param authStatus Authentication status containing endpoint and username
 * @returns Array of prompt IDs ordered by recency (most recent first)
 */
export function getRecentlyUsedPrompts({
    authStatus,
}: {
    authStatus: { endpoint: string; username: string }
}): string[] {
    const key = getLocalStorageKey({ authStatus })
    const data = localStorage.get<string>(key)
    if (!data) {
        return []
    }
    return JSON.parse(data)
}
