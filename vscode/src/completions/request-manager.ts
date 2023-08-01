import { LRUCache } from 'lru-cache'

import { debug } from '../log'

import { ReferenceSnippet } from './context'
import { CompletionProviderTracer, Provider } from './providers/provider'
import { Completion } from './types'

export interface RequestParams {
    // TODO(sqs): This is not a unique enough cache key. We should cache based on the params wrapped
    // into generateCompletions instead of requiring callers to separately pass cache-key-able
    // params to RequestManager.
    prefix: string
}

export interface RequestManagerResult {
    completions: Completion[]
    cacheHit: boolean
}

/**
 * This class can handle concurrent requests for code completions. The idea is
 * that requests are not cancelled even when the user continues typing in the
 * document. This allows us to cache the results of expensive completions and
 * return them when the user triggers a completion again.
 */
export class RequestManager {
    private cache = new RequestCache()

    public async request(
        params: RequestParams,
        providers: Provider[],
        context: ReferenceSnippet[],
        signal?: AbortSignal,
        tracer?: CompletionProviderTracer
    ): Promise<RequestManagerResult> {
        const existing = this.cache.get({ params })
        if (existing) {
            debug('RequestManager', 'cache hit', { verbose: { params, existing } })
            return { ...existing.result, cacheHit: true }
        }
        debug('RequestManager', 'cache miss', { verbose: { params } })

        // We forward a different abort controller to the network request so we
        // can cancel the network request independently of the user cancelling
        // the completion.
        const networkRequestAbortController = new AbortController()

        return Promise.all(
            providers.map(c => c.generateCompletions(networkRequestAbortController.signal, context, tracer))
        )
            .then(res => res.flat())
            .then(completions => {
                // Cache even if the request was aborted.
                this.cache.set({ params }, { result: { completions } })

                if (signal?.aborted) {
                    throw new Error('aborted')
                }

                return { completions, cacheHit: false }
            })
    }
}

interface RequestCacheKey {
    params: RequestParams
}

interface RequestCacheEntry {
    result: Omit<RequestManagerResult, 'cacheHit'>
}

class RequestCache {
    private cache = new LRUCache<string, RequestCacheEntry>({ max: 50 })

    private toCacheKey(key: RequestCacheKey): string {
        return key.params.prefix
    }

    public get(key: RequestCacheKey): RequestCacheEntry | undefined {
        return this.cache.get(this.toCacheKey(key))
    }

    public set(key: RequestCacheKey, entry: RequestCacheEntry): void {
        this.cache.set(this.toCacheKey(key), entry)
    }
}
