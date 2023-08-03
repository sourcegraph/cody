import { LRUCache } from 'lru-cache'

import { Completion } from '../types'

/**
 * The document state information used by {@link CompletionsCache}.
 */
export interface CompletionsCacheDocumentState {
    /**
     * The document URI.
     */
    uri: string

    /**
     * The prefix (up to the cursor) of the source file where the completion request was triggered.
     */
    prefix: string

    /**
     * The suffix (after the cursor) of the source file where the completion request was triggered.
     */
    suffix: string

    /**
     * The cursor position in the source file where the completion request was triggered.
     */
    position: number

    /**
     * The language of the document, used to ensure that completions are cached separately for
     * different languages (even if the files have the same prefix).
     */
    languageId: string
}

/**
 * A completions cache for multiple documents.
 */
export class CompletionsCache {
    // Only maintain caches for the 5 most recent documents.
    private documentCaches = new LRUCache<string, DocumentCompletionsCache>({ max: 5 })

    private documentCache({ uri, languageId }: CompletionsCacheDocumentState): DocumentCompletionsCache {
        const key = `${languageId}:${uri}`
        let cache = this.documentCaches.get(key)
        if (!cache) {
            cache = new DocumentCompletionsCache()
            this.documentCaches.set(key, cache)
        }
        return cache
    }

    public get(documentState: CompletionsCacheDocumentState): Completion[] | undefined {
        return this.documentCache(documentState).get(documentState)
    }

    public add(documentState: CompletionsCacheDocumentState, completions: Completion[]): void {
        return this.documentCache(documentState).add(documentState, completions)
    }
}

interface CacheEntry {
    documentState: CompletionsCacheDocumentState
    completion: Completion
}
/**
 * A completions cache for a single document.
 */
class DocumentCompletionsCache {
    // We use a simple LRU queue for the completions.
    private cache = new LRUQueue<CacheEntry>(50)

    public get(documentState: CompletionsCacheDocumentState): Completion[] | undefined {
        const synthesizedCompletions: Completion[] = []

        for (const entry of this.cache.entries()) {
            const exactMatch =
                documentState.position === entry.documentState.position &&
                documentState.prefix === entry.documentState.prefix &&
                documentState.suffix === entry.documentState.suffix
            if (exactMatch) {
                // Update the recency of the cache entry
                this.cache.get(entry)
                synthesizedCompletions.push(entry.completion)
                continue
            }

            const offset = documentState.position - entry.documentState.position

            // Request is after the cached position.
            if (offset > 0) {
                const addedText = documentState.prefix.slice(-offset)

                // Ensure the current document and cached document share a common prefix.
                // TODO: Allow partial overlap because completions only contain up to a fixed number
                //       of lines above the cursor as the prefix.
                const prefixMatch = documentState.prefix.startsWith(entry.documentState.prefix)
                if (!prefixMatch) {
                    continue
                }

                // Find completion that start with the addedText and would still be valid.
                const validCompletion = entry.completion.content.startsWith(addedText)
                if (!validCompletion) {
                    continue
                }

                // Trim the addedText from the valid completions because the addedText is already
                // present in the document.
                const trimmedCompletions = {
                    ...entry.completion,
                    content: entry.completion.content.slice(addedText.length),
                }

                // Update the recency of the cache entry
                this.cache.get(entry)
                synthesizedCompletions.push(trimmedCompletions)
            }

            // Request is before the cached position.
            if (offset < 0) {
                const deletedText = entry.documentState.prefix.slice(offset)

                // Ensure the current document and cached document share a common prefix.
                // TODO: Allow partial overlap because completions only contain up to a fixed number
                //       of lines above the cursor as the prefix.
                const prefixMatch = entry.documentState.prefix.startsWith(documentState.prefix)
                if (!prefixMatch) {
                    continue
                }

                // Do not reuse cache entries across starting lines.
                if (deletedText.includes('\n')) {
                    continue
                }

                // Find completions that came after the deletedText, and prepend the deletedText to
                // them.
                const prependedCompletion = {
                    ...entry.completion,
                    content: deletedText + entry.completion.content,
                }

                // Update the recency of the cache entry
                this.cache.get(entry)
                synthesizedCompletions.push(prependedCompletion)
            }
        }

        return synthesizedCompletions.length > 0 ? synthesizedCompletions : undefined // cache miss
    }

    public add(documentState: CompletionsCacheDocumentState, completions: Completion[]): void {
        for (const completion of completions) {
            this.cache.add({ documentState, completion })
        }
    }
}

class LRUQueue<T> {
    private items: T[] = []

    constructor(private max: number) {}

    public get(item: T): T | undefined {
        const index = this.items.indexOf(item)
        if (index === -1) {
            return undefined
        }
        const removed = this.items.splice(index, 1)[0]
        this.items.push(removed)
        return removed
    }

    public add(item: T): void {
        this.items.push(item)
        if (this.items.length > this.max) {
            this.items.shift()
        }
    }

    public entries(): T[] {
        // We create a copy so that any mutations on th array doesn't cause
        // issues downstream
        return [...this.items]
    }
}
