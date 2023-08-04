import { LRUCache } from 'lru-cache'

import { debug } from '../log'

import { ReferenceSnippet } from './context'
import { logCompletionEvent } from './logger'
import { CompletionProviderTracer, Provider } from './providers/provider'
import { Completion } from './types'

export interface RequestParams {
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

    /**
     * Wether the completion request is multiline or not.
     */
    multiline: boolean
}

export interface RequestManagerResult {
    completions: Completion[]
    cacheHit: 'hit' | 'hit-after-request-started' | null
}

/**
 * This class can handle concurrent requests for code completions. The idea is
 * that requests are not cancelled even when the user continues typing in the
 * document. This allows us to cache the results of expensive completions and
 * return them when the user triggers a completion again.
 *
 * It also retests the request against the completions cache when an inflight
 * request resolves. Since our completions cache is capable of synthesizing
 * completions, it can be used to provide completions for requests that are
 * still inflight.
 */
export class RequestManager {
    private cache = new RequestCache()
    private readonly inflightRequests: Set<InflightRequest> = new Set()

    public async request(
        params: RequestParams,
        providers: Provider[],
        context: ReferenceSnippet[],
        signal?: AbortSignal,
        tracer?: CompletionProviderTracer
    ): Promise<RequestManagerResult> {
        const cachedCompletions = this.cache.get(params)
        if (cachedCompletions) {
            debug('RequestManager', 'cache hit', { verbose: { params, cachedCompletions } })
            return { completions: cachedCompletions, cacheHit: 'hit' }
        }
        debug('RequestManager', 'cache miss', { verbose: { params } })

        const request = new InflightRequest(params)
        this.inflightRequests.add(request)

        // We forward a different abort controller to the network request so we
        // can cancel the network request independently of the user cancelling
        // the completion.
        const networkRequestAbortController = new AbortController()

        Promise.all(providers.map(c => c.generateCompletions(networkRequestAbortController.signal, context, tracer)))
            .then(res => res.flat())
            .then(completions => {
                // Cache even if the request was aborted or already fulfilled.
                this.cache.set(params, completions)

                if (signal?.aborted) {
                    throw new Error('aborted')
                }

                // A promise will never resolve twice, so we do not need to
                // check if the request was already fulfilled.
                request.resolve({ completions, cacheHit: null })
            })
            .catch(error => {
                request.reject(error)
            })
            .finally(() => {
                this.inflightRequests.delete(request)
                this.retestCaches(params)
            })

        return request.promise
    }

    /**
     * When one network request completes and the item is being added to the
     * completion cache, we check all pending requests for the same document to
     * see if we can synthesize a completion response from the new cache.
     */
    private retestCaches({ uri }: RequestParams): void {
        for (const request of this.inflightRequests) {
            if (request.params.uri !== uri) {
                continue
            }

            const cachedCompletions = this.cache.get(request.params)
            if (cachedCompletions) {
                logCompletionEvent('synthesizedFromParallelRequest')
                debug('RequestManager', 'cache hit after request started', {
                    verbose: { params: request.params, cachedCompletions },
                })
                request.resolve({ completions: cachedCompletions, cacheHit: 'hit-after-request-started' })
                this.inflightRequests.delete(request)
            }
        }
    }
}

class InflightRequest {
    public promise: Promise<RequestManagerResult>
    public resolve: (result: RequestManagerResult) => void
    public reject: (error: Error) => void

    constructor(public params: RequestParams) {
        // The promise constructor is called synchronously, so this is just to
        // make TS happy
        this.resolve = () => {}
        this.reject = () => {}

        this.promise = new Promise<RequestManagerResult>((res, rej) => {
            this.resolve = res
            this.reject = rej
        })
    }
}

class RequestCache {
    private cache = new LRUCache<string, Completion[]>({ max: 50 })

    private toCacheKey(key: RequestParams): string {
        return key.prefix
    }

    public get(key: RequestParams): Completion[] | undefined {
        return this.cache.get(this.toCacheKey(key))
    }

    public set(key: RequestParams, entry: Completion[]): void {
        this.cache.set(this.toCacheKey(key), entry)
    }
}
