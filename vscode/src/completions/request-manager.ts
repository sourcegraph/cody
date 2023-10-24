import { LRUCache } from 'lru-cache'
import * as vscode from 'vscode'

import { DocumentContext } from './get-current-doc-context'
import { InlineCompletionsResultSource, LastInlineCompletionCandidate } from './get-inline-completions'
import { logCompletionEvent, SuggestionID } from './logger'
import { CompletionProviderTracer, Provider } from './providers/provider'
import { reuseLastCandidate } from './reuse-last-candidate'
import {
    InlineCompletionItemWithAnalytics,
    processInlineCompletions,
} from './text-processing/process-inline-completions'
import { ContextSnippet } from './types'
import { forkSignal } from './utils'

export interface RequestParams {
    /** The request's document **/
    document: vscode.TextDocument

    /** The request's document context **/
    docContext: DocumentContext

    /** The state of the completion info box **/
    selectedCompletionInfo: vscode.SelectedCompletionInfo | undefined

    /** The cursor position in the source file where the completion request was triggered. **/
    position: vscode.Position

    /** The abort signal for the request. **/
    abortSignal?: AbortSignal
}

export interface RequestManagerResult {
    completions: InlineCompletionItemWithAnalytics[]
    cacheHit: 'hit' | 'hit-after-request-started' | null
}

/**
 * This class can handle concurrent requests for code completions. The idea is
 * that requests are not cancelled even when the user continues typing in the
 * document. This allows us to cache the results of expensive completions and
 * return them when the user triggers a completion again.
 *
 * It also retests the request against the completion result of an inflight
 * request that just resolved and uses the last candidate logic to synthesize
 * completions if possible.
 */
export class RequestManager {
    private cache = new RequestCache()
    private readonly inflightRequests: Set<InflightRequest> = new Set()
    private disableNetworkCache = false
    private disableRecyclingOfPreviousRequests = false

    constructor(
        {
            disableNetworkCache = false,
            disableRecyclingOfPreviousRequests = false,
        }: {
            disableNetworkCache?: boolean
            disableRecyclingOfPreviousRequests?: boolean
        } = {
            disableNetworkCache: false,
            disableRecyclingOfPreviousRequests: false,
        }
    ) {
        this.disableNetworkCache = disableNetworkCache
        this.disableRecyclingOfPreviousRequests = disableRecyclingOfPreviousRequests
    }

    public async request(
        params: RequestParams,
        providers: Provider[],
        context: ContextSnippet[],
        tracer?: CompletionProviderTracer
    ): Promise<RequestManagerResult> {
        if (!this.disableNetworkCache) {
            const cachedCompletions = this.cache.get(params)
            if (cachedCompletions) {
                return { completions: cachedCompletions, cacheHit: 'hit' }
            }
        }

        // When request recycling is enabled, we do not pass the original abort signal forward as to
        // not interrupt requests that are no longer relevant. Instead, we let all previous requests
        // complete and try to see if their results can be reused for other inflight requests.
        let abortController: AbortController = new AbortController()
        if (this.disableRecyclingOfPreviousRequests && params.abortSignal) {
            abortController = forkSignal(params.abortSignal)
        }

        const request = new InflightRequest(params, abortController)
        this.inflightRequests.add(request)

        Promise.all(
            providers.map(provider => provider.generateCompletions(request.abortController.signal, context, tracer))
        )
            .then(res => res.flat())
            .then(completions =>
                // Shared post-processing logic
                processInlineCompletions(completions, params)
            )
            .then(processedCompletions => {
                if (!this.disableNetworkCache) {
                    // Cache even if the request was aborted or already fulfilled.
                    this.cache.set(params, processedCompletions)
                }

                // A promise will never resolve twice, so we do not need to
                // check if the request was already fulfilled.
                request.resolve({ completions: processedCompletions, cacheHit: null })

                if (!this.disableRecyclingOfPreviousRequests) {
                    this.testIfResultCanBeRecycledForInflightRequests(request, processedCompletions)
                }

                return processedCompletions
            })
            .catch(error => {
                request.reject(error)
            })
            .finally(() => {
                this.inflightRequests.delete(request)
            })

        return request.promise
    }

    public removeFromCache(params: RequestParams): void {
        this.cache.delete(params)
    }

    /**
     * Test if the result can be used for inflight requests. This only works
     * if a completion is a forward-typed version of a previous completion.
     */
    private testIfResultCanBeRecycledForInflightRequests(
        resolvedRequest: InflightRequest,
        items: InlineCompletionItemWithAnalytics[]
    ): void {
        const { document, position, docContext, selectedCompletionInfo } = resolvedRequest.params
        const lastCandidate: LastInlineCompletionCandidate = {
            uri: document.uri,
            lastTriggerPosition: position,
            lastTriggerDocContext: docContext,
            lastTriggerSelectedCompletionInfo: selectedCompletionInfo,
            result: {
                logId: '' as SuggestionID,
                source: InlineCompletionsResultSource.Network,
                items,
            },
        }

        for (const request of this.inflightRequests) {
            if (request === resolvedRequest) {
                continue
            }

            if (request.params.document.uri.toString() !== document.uri.toString()) {
                continue
            }

            const synthesizedCandidate = reuseLastCandidate({
                document: request.params.document,
                position: request.params.position,
                lastCandidate,
                docContext: request.params.docContext,
                selectedCompletionInfo: request.params.selectedCompletionInfo,
            })

            if (synthesizedCandidate) {
                const synthesizedItems = synthesizedCandidate.items

                logCompletionEvent('synthesizedFromParallelRequest')
                request.resolve({ completions: synthesizedItems, cacheHit: 'hit-after-request-started' })
                request.abortController.abort()
                this.inflightRequests.delete(request)
            }
        }
    }
}

class InflightRequest {
    public promise: Promise<RequestManagerResult>
    public resolve: (result: RequestManagerResult) => void
    public reject: (error: Error) => void

    constructor(
        public params: RequestParams,
        public abortController: AbortController
    ) {
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
    private cache = new LRUCache<string, InlineCompletionItemWithAnalytics[]>({ max: 50 })

    private toCacheKey(key: RequestParams): string {
        return `${key.docContext.prefix}█${key.docContext.nextNonEmptyLine}`
    }

    public get(key: RequestParams): InlineCompletionItemWithAnalytics[] | undefined {
        return this.cache.get(this.toCacheKey(key))
    }

    public set(key: RequestParams, entry: InlineCompletionItemWithAnalytics[]): void {
        this.cache.set(this.toCacheKey(key), entry)
    }

    public delete(key: RequestParams): void {
        this.cache.delete(this.toCacheKey(key))
    }
}
