import { LRUCache } from 'lru-cache'

import { debug } from '../log'

import { ReferenceSnippet } from './context'
import { CompletionProviderTracer, Provider } from './providers/provider'
import { Completion } from './types'

export interface RequestParams {
    prefix: string
}

export interface RequestManagerResult {
    completions: Completion[]
    cacheHit: boolean
}

interface Request {
    params: RequestParams
    tracer?: CompletionProviderTracer
    resolve(result: RequestManagerResult): void
    reject(error: Error): void
}

/**
 * This class can handle concurrent requests for code completions. The idea is
 * that requests are not cancelled even when the user continues typing in the
 * document. This allows us to cache the results of expensive completions and
 * return them when the user triggers a completion again.
 */
export class RequestManager {
    private readonly requests: Map<string, Request[]> = new Map()

    private cache = new RequestCache()

    public async request(
        documentUri: string,
        logId: string,
        params: RequestParams,
        providers: Provider[],
        context: ReferenceSnippet[],
        signal?: AbortSignal,
        tracer?: CompletionProviderTracer
    ): Promise<RequestManagerResult> {
        const existing = this.cache.get({ params })
        if (existing) {
            debug('RequestManager', 'cache hit', { verbose: { params, existing } })
            return { ...existing.result, cacheHit: true } // TODO(sqs): fixup logId
        }
        debug('RequestManager', 'cache miss', { verbose: { params } })

        let resolve: Request['resolve'] = () => {}
        let reject: Request['reject'] = () => {}
        const requestPromise = new Promise<RequestManagerResult>((res, rej) => {
            resolve = res
            reject = rej
        })

        const request: Request = {
            params,
            resolve,
            reject,
            tracer,
        }
        this.startRequest(request, documentUri, logId, providers, context, signal)

        return requestPromise
    }

    private startRequest(
        request: Request,
        documentUri: string,
        logId: string,
        providers: Provider[],
        context: ReferenceSnippet[],
        signal?: AbortSignal
    ): void {
        // We forward a different abort controller to the network request so we
        // can cancel the network request independently of the user cancelling
        // the completion.
        const networkRequestAbortController = new AbortController()

        this.addRequest(documentUri, request)

        Promise.all(
            providers.map(c => c.generateCompletions(networkRequestAbortController.signal, context, request.tracer))
        )
            .then(res => res.flat())
            .then(completions => {
                this.cache.set({ params: request.params }, { logId, result: { completions } })

                if (signal?.aborted) {
                    throw new Error('aborted')
                }

                request.resolve({ completions, cacheHit: false })
            })
            .catch(error => {
                request.reject(error)
            })
            .finally(() => {
                this.removeRequest(documentUri, request)
            })
    }

    private addRequest(documentUri: string, request: Request): void {
        let requestsForDocument: Request[] = []
        if (this.requests.has(documentUri)) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            requestsForDocument = this.requests.get(documentUri)!
        } else {
            this.requests.set(documentUri, requestsForDocument)
        }
        requestsForDocument.push(request)
    }

    private removeRequest(documentUri: string, request: Request): void {
        const requestsForDocument = this.requests.get(documentUri)
        const index = requestsForDocument?.indexOf(request)

        if (requestsForDocument === undefined || index === undefined || index === -1) {
            return
        }

        requestsForDocument.splice(index, 1)

        if (requestsForDocument.length === 0) {
            this.requests.delete(documentUri)
        }
    }
}

interface RequestCacheKey {
    params: RequestParams
}

interface RequestCacheEntry {
    logId: string
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
