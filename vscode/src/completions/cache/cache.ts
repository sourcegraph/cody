import { LRUCache } from 'lru-cache'

import { Completion } from '..'

export interface CachedCompletions {
    logId: string
    completions: Completion[]
}

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
     * The cursor position in the source file where the completion request was triggered.
     */
    position: number

    /**
     * The suffix (after the cursor) of the source file where the completion request was triggered.
     */
    suffix: string

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

/*
 * Only the first {@link CACHE_KEY_DOCUMENT_CONTENT_SUFFIX_LENGTH} characters of the prefix and
 * suffix are used to distinguish cache keys (because an edit that is sufficiently far away from the
 * cursor can be considered to not invalidate the relevant cache entries).
 **/
const CACHE_KEY_DOCUMENT_CONTENT_PREFIX_SUFFIX_LENGTH = 200

/**
 * A completions cache for multiple documents.
 */
export class CompletionsCache {
    private documentCaches = new LRUCache<string, DocumentCompletionsCache>({
        max: 5, // Only maintain caches for the 5 most recent documents.
    })

    private documentCache({ uri, languageId }: CompletionsCacheDocumentState): DocumentCompletionsCache {
        const key = `${languageId}:${uri}`
        let cache = this.documentCaches.get(key)
        if (!cache) {
            cache = new DocumentCompletionsCache()
            this.documentCaches.set(key, cache)
        }
        return cache
    }

    public get(request: CacheRequest): CachedCompletions | undefined {
        return this.documentCache(request.documentState).get(request)
    }

    public add(logId: string, documentState: CompletionsCacheDocumentState, completions: Completion[]): void {
        return this.documentCache(documentState).add(logId, documentState, completions)
    }
}

interface CacheEntry extends CachedCompletions {
    documentState: CompletionsCacheDocumentState
}

/**
 * A completions cache for a single document.
 *
 * TODO(sqs): maybe take advantage of the fact that the range can be arbitrary and not JUST an insertion?
 */
class DocumentCompletionsCache {
    private seq = 0
    private cache = new LRUCache<number, CacheEntry>({ max: 50 })

    public get(req: CacheRequest): Pick<CachedCompletions, 'logId' | 'completions'> | undefined {
        for (const e of this.cache.values() as Generator<CacheEntry>) {
            const exactMatch =
                req.documentState.position === e.documentState.position &&
                req.documentState.prefix === e.documentState.prefix &&
                req.documentState.suffix === e.documentState.suffix
            if (exactMatch) {
                return toResult(e)
            }
            if (req.isExactPrefixOnly) {
                return undefined
            }

            const offset = req.documentState.position - e.documentState.position
            if (offset > 0) {
                // Request is after the cached position.
                const addedText = req.documentState.prefix.slice(-offset)

                // Find completions that start with the addedText and would still be valid.
                const validCompletions = e.completions.filter(c => c.content.startsWith(addedText))

                // Trim the addedText from the valid completions because the addedText is already present in the document.
                const trimmedCompletions = validCompletions.map(c => ({
                    ...c,
                    content: c.content.slice(addedText.length),
                }))

                if (trimmedCompletions.length > 0) {
                    return { logId: e.logId, completions: trimmedCompletions }
                }

                // TODO(sqs): check suffix?
            }
            if (offset < 0) {
                // Request is before the cached position.
                const deletedText = e.documentState.prefix.slice(offset)

                // Do not reuse cache entries across starting lines.
                if (deletedText.includes('\n')) {
                    continue
                }

                // Find completions that came after the deletedText, and prepend the deletedText to
                // them.
                const prependedCompletions = e.completions.map(c => ({ ...c, content: deletedText + c.content }))

                if (prependedCompletions.length > 0) {
                    return { logId: e.logId, completions: prependedCompletions }
                }
            }
        }

        return undefined // cache miss
    }

    public add(logId: string, documentState: CompletionsCacheDocumentState, completions: Completion[]): void {
        // TODO(sqs): merge identical completions?
        this.cache.set(++this.seq, { logId, completions, documentState })
    }
}

function toResult(e: CacheEntry): CachedCompletions {
    return { logId: e.logId, completions: e.completions }
}
