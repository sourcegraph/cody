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

    /**
     * The language of the document, used to ensure that completions are cached separately for
     * different languages (even if the files have the same prefix).
     */
    languageId: string
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

function cacheKey({ prefix, languageId }: CompletionsCacheDocumentState): string {
    return `${languageId}<|>${prefix}`
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
    public get({
        documentState: { prefix, languageId },
        isExactPrefixOnly,
    }: CacheRequest): CachedCompletions | undefined {
        const trimmedPrefix = isExactPrefixOnly ? prefix : trimEndOnLastLineIfWhitespaceOnly(prefix)
        const key = cacheKey({ prefix: trimmedPrefix, languageId })
        return this.cache.get(key)
    }

    public add(logId: string, documentState: CompletionsCacheDocumentState, completions: Completion[]): void {
        const trimmedPrefix = trimEndOnLastLineIfWhitespaceOnly(documentState.prefix)

        for (const completion of completions) {
            // Cache the exact prefix first and then append characters from the
            // completion one after the other until the first line is exceeded.
            //
            // If the completion starts with a `\n`, this logic will append the
            // second line instead.
            let maxCharsAppended = completion.content.indexOf('\n', completion.content.at(0) === '\n' ? 1 : 0)
            if (maxCharsAppended === -1) {
                maxCharsAppended = completion.content.length - 1
            }

            // We also cache the completion with the exact (= untrimmed) prefix for the separate
            // lookup mode used for deletions.
            const prefixHasTrailingWhitespaceOnLastLine = trimmedPrefix !== documentState.prefix
            if (prefixHasTrailingWhitespaceOnLastLine) {
                this.insertCompletion(
                    cacheKey({ prefix: documentState.prefix, languageId: documentState.languageId }),
                    logId,
                    completion,
                    true
                )
            }

            for (let i = 0; i <= maxCharsAppended; i++) {
                const completionPrefixToAppend = completion.content.slice(0, i)
                const partialCompletionContent = completion.content.slice(i)
                const appendedPrefix = trimmedPrefix + completionPrefixToAppend
                const key = cacheKey({
                    prefix: appendedPrefix,
                    languageId: documentState.languageId,
                })
                this.insertCompletion(
                    key,
                    logId,
                    { content: partialCompletionContent },
                    appendedPrefix === documentState.prefix
                )
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

    /**
     * For use by tests only.
     */
    public get __stateForTestsOnly(): { [key: string]: CachedCompletions } {
        return Object.fromEntries(this.cache.entries())
    }
}
