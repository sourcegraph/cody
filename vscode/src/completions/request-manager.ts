import { debug } from '../log'

import { Completion } from '.'
import { CompletionsCache } from './cache'
import { ReferenceSnippet } from './context'
import { Provider } from './providers/provider'

interface Request {
    prefix: string
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
        // We forward a different abort controller to the network request so we
        // can cancel the network request independently of the user cancelling
        // the completion.
        const networkRequestAbortController = new AbortController()

        const request: Request = { prefix }

        let requestsForDocument: Request[] = []
        if (this.requests.has(documentUri)) {
            requestsForDocument = this.requests.get(documentUri)!
        } else {
            this.requests.set(documentUri, requestsForDocument)
        }
        requestsForDocument.push(request)

        try {
            const completions = (
                await Promise.all(
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
            ).flat()
            this.completionsCache?.add(logId, completions)

            // TODO: Go over all open requests and see if we now have a cache hit
            // that we can use for some reason

            if (signal.aborted) {
                throw new Error('aborted')
            }

            return completions
        } finally {
            const index = requestsForDocument.indexOf(request)
            requestsForDocument.splice(index, 1)

            if (requestsForDocument.length === 0) {
                this.requests.delete(documentUri)
            }
        }
    }
}
