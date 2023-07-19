import { debug } from '../log'

import { Completion } from '.'
import { CompletionsCache } from './cache'
import { ReferenceSnippet } from './context'
import { Provider } from './providers/provider'

interface Request {
    prefix: string
    resolve(completions: Completion[]): void
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

    constructor(private completionsCache: CompletionsCache | undefined) {}

    public async request(
        documentUri: string,
        logId: string,
        prefix: string,
        providers: Provider[],
        context: ReferenceSnippet[],
        signal: AbortSignal
    ): Promise<Completion[]> {
        let resolve: Request['resolve'] = () => {}
        let reject: Request['reject'] = () => {}
        const requestPromise = new Promise<Completion[]>((res, rej) => {
            resolve = res
            reject = rej
        })

        const request: Request = {
            prefix,
            resolve,
            reject,
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
        signal: AbortSignal
    ): void {
        // We forward a different abort controller to the network request so we
        // can cancel the network request independently of the user cancelling
        // the completion.
        const networkRequestAbortController = new AbortController()

        this.addRequest(documentUri, request)

        Promise.all(
            providers.map(async c => {
                const generateCompletionsStart = Date.now()
                const completions = await c.generateCompletions(networkRequestAbortController.signal, context)
                debug(
                    'CodyCompletionProvider:inline:timing',
                    `${Math.round(Date.now() - generateCompletionsStart)}ms`,
                    { id: c.id }
                )
                return completions
            })
        )
            .then(res => res.flat())
            .then(completions => {
                // Add the completed results to the cache, even if the request
                // was cancelled before or completed via a cache retest of a
                // previous request.
                this.completionsCache?.add(logId, completions)

                if (signal.aborted) {
                    throw new Error('aborted')
                }

                request.resolve(completions)
            })
            .catch(error => {
                request.reject(error)
            })
            .finally(() => {
                this.removeRequest(documentUri, request)
                this.retestCaches(documentUri)
            })
    }

    /**
     * When one network request completes and the item is being added to the
     * completion cache, we check all pending requests for the same document to
     * see if we can synthesize a completion response from the new cache.
     */
    private retestCaches(documentUri: string): void {
        const requests = this.requests.get(documentUri)
        if (!requests) {
            return
        }

        for (const request of requests) {
            const cachedCompletions = this.completionsCache?.get(request.prefix)
            if (cachedCompletions) {
                debug('CodyCompletionProvider:RequestManager:cacheHit', '')
                request.resolve(cachedCompletions.completions)
                this.removeRequest(documentUri, request)
            }
        }
    }

    private addRequest(documentUri: string, request: Request): void {
        let requestsForDocument: Request[] = []
        if (this.requests.has(documentUri)) {
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
