import { LRUCache } from 'lru-cache'
import * as uuid from 'uuid'

import type { AutoeditModelOptions } from '../adapters/base'
import type { AutoeditSuggestionID } from './analytics-logger'

/**
 * A specialized string type for the stable “suggestion key” in caches.
 */
export type AutoeditSuggestionKey = string & { readonly _brand: 'AutoeditSuggestionKey' }

/**
 * A small helper class that generates or retrieves stable AutoeditSuggestionIDs.
 * This encapsulates the logic of deduplicating identical suggestions.
 */
export class AutoeditSuggestionIdRegistry {
    private suggestionIdCache = new LRUCache<AutoeditSuggestionKey, AutoeditSuggestionID>({ max: 50 })

    /**
     * Produce a stable suggestion ID for the given context + text, reusing
     * previously generated IDs for duplicates.
     */
    public getOrCreate(options: AutoeditModelOptions, prediction: string): AutoeditSuggestionID {
        const key = this.getAutoeditSuggestionKey(options, prediction)
        let stableId = this.suggestionIdCache.get(key)
        if (!stableId) {
            stableId = uuid.v4() as AutoeditSuggestionID
            this.suggestionIdCache.set(key, stableId)
        }
        return stableId
    }

    /**
     * Creates a stable string key that identifies the same suggestion across repeated displays.
     */
    private getAutoeditSuggestionKey(
        params: AutoeditModelOptions,
        prediction: string
    ): AutoeditSuggestionKey {
        const key = `${params.prompt.systemMessage}█${params.prompt.userMessage}█${prediction}`
        return key as AutoeditSuggestionKey
    }

    public deleteEntryIfValueExists(id: AutoeditSuggestionID): void {
        let matchingKey: string | null = null

        this.suggestionIdCache.forEach((value, key) => {
            if (value === id) {
                matchingKey = key
            }
        })

        if (matchingKey) {
            this.suggestionIdCache.delete(matchingKey)
        }
    }
}
