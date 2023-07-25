import { LRUCache } from 'lru-cache'

import { Completion } from '..'
import { trimEndOnLastLineIfWhitespaceOnly } from '../text-processing'

export interface CachedCompletions {
    logId: string
    isExactPrefix: boolean
    completions: Completion[]
}

/**
 * The document state information used by {@link CompletionsCache}.
 */
export interface CompletionsCacheDocumentState {
    /**
     * The prefix (up to the cursor) of the source file where the completion request was triggered.
     */
    prefix: string
}

export interface CacheRequest {
    /** The representation of the document and cursor. */
    documentState: CompletionsCacheDocumentState

    /**
     * Only return a cache entry if the prefix matches exactly (without trimming whitespace).
     *
     * @default false
     */
    isExactPrefixOnly?: boolean
}

function cacheKey({ prefix }: CompletionsCacheDocumentState): string {
    return prefix
}

export class CompletionsCache {
    private cache = new LRUCache<string, CachedCompletions>({
        max: 500, // Maximum input prefixes in the cache.
    })

    public clear(): void {
        this.cache.clear()
    }

    // TODO: The caching strategy only takes the file content prefix into
    // account. We need to add additional information like file path or suffix
    // to make sure the cache does not return undesired results for other files
    // in the same project.
    public get({ documentState: { prefix }, isExactPrefixOnly }: CacheRequest): CachedCompletions | undefined {
        const trimmedPrefix = isExactPrefixOnly ? prefix : trimEndOnLastLineIfWhitespaceOnly(prefix)
        const key = cacheKey({ prefix: trimmedPrefix })
        const result = this.cache.get(key)

        if (!result) {
            return undefined
        }

        const completions = result.completions.map(completion => {
            if (trimmedPrefix.length === trimEndOnLastLineIfWhitespaceOnly(completion.prefix).length) {
                return { ...completion, prefix, content: completion.content }
            }

            // Cached results can be created by appending characters from a
            // recommendation from a smaller input prompt. If that's the
            // case, we need to slightly change the content and remove
            // characters that are now part of the prefix.
            const sliceChars = prefix.length - completion.prefix.length
            return {
                ...completion,
                prefix,
                content: completion.content.slice(sliceChars),
            }
        })

        return {
            ...result,
            completions,
        }
    }

    public add(logId: string, completions: Completion[]): void {
        for (const completion of completions) {
            // Cache the exact prefix first and then append characters from the
            // completion one after the other until the first line is exceeded.
            //
            // If the completion starts with a `\n`, this logic will append the
            // second line instead.
            let maxCharsAppended = completion.content.indexOf('\n', completion.content.at(0) === '\n' ? 1 : 0)
            if (maxCharsAppended === -1) {
                maxCharsAppended = completion.content.length
            }

            // We also cache the completion with the exact (= untrimmed) prefix
            // for the separate lookup mode used for deletions
            if (trimEndOnLastLineIfWhitespaceOnly(completion.prefix) !== completion.prefix) {
                this.insertCompletion(cacheKey({ prefix: completion.prefix }), logId, completion, true)
            }

            for (let i = 0; i <= maxCharsAppended; i++) {
                const key = cacheKey({
                    prefix: trimEndOnLastLineIfWhitespaceOnly(completion.prefix) + completion.content.slice(0, i),
                })
                this.insertCompletion(key, logId, completion, key === completion.prefix)
            }
        }
    }

    private insertCompletion(key: string, logId: string, completion: Completion, isExactPrefix: boolean): void {
        let existingCompletions: Completion[] = []
        if (this.cache.has(key)) {
            existingCompletions = this.cache.get(key)!.completions
        }

        const cachedCompletion: CachedCompletions = {
            logId,
            isExactPrefix,
            completions: existingCompletions.concat(completion),
        }

        this.cache.set(key, cachedCompletion)
    }
}
