import { ReferenceSnippet } from './context'
import { CompletionProviderTracer, Provider } from './providers/provider'
import { Completion } from './types'

/**
 * This class can handle concurrent requests for code completions. The idea is
 * that requests are not cancelled even when the user continues typing in the
 * document. This allows us to cache the results of expensive completions and
 * return them when the user triggers a completion again.
 */
export class RequestManager {
    public async request(
        documentUri: string,
        logId: string,
        prefix: string,
        providers: Provider[],
        context: ReferenceSnippet[],
        signal: AbortSignal,
        tracer?: CompletionProviderTracer
    ): Promise<Completion[]> {
        // We forward a different abort controller to the network request so we
        // can cancel the network request independently of the user cancelling
        // the completion.
        const networkRequestAbortController = new AbortController()

        return Promise.all(
            providers.map(c => c.generateCompletions(networkRequestAbortController.signal, context, tracer))
        )
            .then(res => res.flat())
            .then(completions => {
                if (signal.aborted) {
                    throw new Error('aborted')
                }
                return completions
            })
    }
}
