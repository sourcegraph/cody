import type { SerializedContextItem } from '@sourcegraph/cody-shared'
import type { ContextItem } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { deserializeContextItem } from '@sourcegraph/cody-shared/src/lexicalEditor/nodes'
import _ from 'lodash'
import { localStorage } from '../services/LocalStorageProvider'

// Constants
const LOCAL_STORAGE_KEY = 'cody-frequently-used-items'
const MAX_STORED_ITEMS = 20
const MAX_RECENT_ITEMS = 10
// Time constants for decay calculation (in milliseconds)
const HOUR_MS = 3600 * 1000
const DAY_MS = 24 * HOUR_MS

// Types
export interface StoredItem {
    item: SerializedContextItem
    lastUsed: number
    useCount: number
}

const getLocalStorageKey = ({
    authStatus,
    codebase,
}: { authStatus: { endpoint: string; username: string }; codebase?: string }): string => {
    return `${LOCAL_STORAGE_KEY}:${authStatus.endpoint}:${authStatus.username}:${codebase || '__HOME__'}`
}

const getStoredItems = ({
    authStatus,
    codebase,
}: { authStatus: { endpoint: string; username: string }; codebase?: string }): StoredItem[] => {
    const data = localStorage.get<string>(getLocalStorageKey({ authStatus, codebase }))
    if (!data) {
        return []
    }
    return JSON.parse(data)
}

/**
 * Save items to localStorage
 */
function saveStoredItems({
    items,
    authStatus,
    codebase,
}: {
    items: StoredItem[]
    authStatus: { endpoint: string; username: string }
    codebase?: string
}): void {
    try {
        localStorage.set(getLocalStorageKey({ authStatus, codebase }), JSON.stringify(items))
    } catch (error) {
        console.error('Failed to save frequently used items:', error)
    }
}

/**
 * Calculate item score using a simplified algorithm that considers:
 * - Frequency: How many times the item was used
 * - Recency: How recently the item was used
 */
function calculateItemScore(item: StoredItem): number {
    const now = Date.now()

    // Base frequency score - give more weight since frequent use is a strong signal
    const frequencyScore = item.useCount

    // Recency score - exponential decay based on time since last use
    const recencyFactor = Math.exp((-1 * (now - item.lastUsed)) / (2 * DAY_MS))

    // Combine factors with adjusted weights:
    // - Frequency gets higher weight (0.8) since repeatedly used items are more important
    // - Recency gets lower weight (2.0) to avoid too much decay but still favor recent items
    return frequencyScore * 0.8 + recencyFactor * 2.0
}

/**
 * Get frequently used context items, optionally filtered by a search query.
 * Items are sorted by a score combining frequency of use and recency.
 * @param query Optional search query to filter items by title, description or URI
 * @param authStatus Authentication status containing endpoint and username
 * @param codebases Array of codebase names to fetch items from
 * @returns Array of ContextItems, limited to 20 items, sorted by frequency and recency score
 */
export function getFrequentlyUsedContextItems({
    query,
    authStatus,
    codebases,
}: {
    query?: string
    authStatus: {
        endpoint: string
        username: string
    }
    codebases: string[]
}): ContextItem[] {
    try {
        // Get items from all codebases and combine them
        const combinedItems: StoredItem[] = []

        for (const codebase of codebases || [undefined]) {
            const data = localStorage.get<string>(getLocalStorageKey({ authStatus, codebase }))
            if (data) {
                const parsed = JSON.parse(data)
                const items: StoredItem[] = Array.isArray(parsed) ? parsed : []
                combinedItems.push(...items)
            }
        }

        return _.uniqBy(combinedItems, item => `${item.item.type}-${item.item.uri}`)
            .filter(({ item }) => {
                if (!query) {
                    return true
                }

                const candidates = [item.title, item.description, item.uri.toString()]

                return candidates.some(candidate =>
                    candidate?.toLowerCase().includes(query.toLowerCase())
                )
            })
            .sort((a, b) => {
                const scoreA = calculateItemScore(a)
                const scoreB = calculateItemScore(b)
                return scoreB - scoreA
            })
            .slice(0, MAX_RECENT_ITEMS)
            .map(item => deserializeContextItem(item.item))
    } catch {
        return []
    }
}

/**
 * Saves multiple context items to local storage, updating existing items' usage counts
 * and last used timestamps. Items are stored per codebase and sorted by a score based
 * on frequency and recency of use.
 * @param items Array of serialized context items to save
 * @param authStatus Authentication details including endpoint and username
 * @param codebases Array of codebase identifiers to save items for
 */
export function saveFrequentlyUsedContextItems({
    items,
    authStatus,
    codebases,
}: {
    items: SerializedContextItem[]
    authStatus: { endpoint: string; username: string }
    codebases: string[]
}): void {
    if (items.length === 0) {
        return
    }

    // Save items to each codebase
    for (const codebase of codebases || [undefined]) {
        let storedItems = getStoredItems({ authStatus, codebase })
        const now = Date.now()

        for (const item of items) {
            const existingItemIndex = storedItems.findIndex(
                stored => stored.item.uri === item.uri && stored.item.type === item.type
            )

            if (existingItemIndex >= 0) {
                // Update existing item
                const existing = storedItems[existingItemIndex]
                storedItems[existingItemIndex] = {
                    item,
                    useCount: existing.useCount + 1,
                    lastUsed: now,
                }
            } else {
                // Add new item
                storedItems.push({
                    item,
                    useCount: 1,
                    lastUsed: now,
                })
            }
        }

        storedItems = storedItems.sort((a, b) => {
            const scoreA = calculateItemScore(a)
            const scoreB = calculateItemScore(b)
            return scoreB - scoreA
        })

        if (storedItems.length > MAX_STORED_ITEMS) {
            storedItems = storedItems.slice(0, MAX_STORED_ITEMS)
        }

        saveStoredItems({ items: storedItems, authStatus, codebase })
    }
}
