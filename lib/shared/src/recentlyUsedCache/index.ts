import type { ContextItem } from '../codebase-context/messages'
import { type SerializedContextItem, deserializeContextItem } from '../lexicalEditor/nodes'

// Constants
const LOCAL_STORAGE_KEY = 'cody-recently-used-items'
const MAX_STORED_ITEMS = 50
const MAX_RECENT_ITEMS = 20
// Time constants for decay calculation (in milliseconds)
const HOUR_MS = 3600 * 1000
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS

// Types
export interface StoredItem {
    item: SerializedContextItem
    lastUsed: number
    useCount: number
}

const getStoredItems = (): StoredItem[] => {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!data) {
        return []
    }
    return JSON.parse(data)
}

/**
 * Save items to localStorage
 */
function saveStoredItems(items: StoredItem[]): void {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items))
    } catch (error) {
        console.error('Failed to save recently used items:', error)
    }
}

/**
 * Calculate item score using a simplified algorithm that considers:
 * - Frequency: How many times the item was used
 * - Recency: How recently the item was used
 */
function calculateItemScore(item: StoredItem): number {
    const now = Date.now()

    // Base frequency score
    const frequencyScore = item.useCount

    // Recency score - exponential decay based on time since last use
    const recencyFactor = Math.exp((-1 * (now - item.lastUsed)) / WEEK_MS)

    // Combine factors - weighting frequency and recency
    return frequencyScore * 0.6 + recencyFactor * 10 * 0.4
}

/**
 * Get recently used context items, optionally filtered by a search query.
 * Items are sorted by a score combining frequency of use and recency.
 * @param query Optional search query to filter items by title
 * @returns Array of ContextItems, limited to 20 items
 */
export function getRecentlyUsedContextItems(query?: string): ContextItem[] {
    try {
        const data = localStorage.getItem(LOCAL_STORAGE_KEY)
        if (!data) {
            return []
        }

        const parsed = JSON.parse(data)
        const items: StoredItem[] = Array.isArray(parsed) ? parsed : []

        return items
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
 * Save multiple context items to storage
 * @param items Array of ContextItems to save
 */
export function saveRecentlyUsedContextItems(items: SerializedContextItem[]): void {
    if (items.length === 0) {
        return
    }

    let storedItems = getStoredItems()
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

    saveStoredItems(storedItems)
}
