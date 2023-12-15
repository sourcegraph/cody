import { ConfigurationWithAccessToken } from '../../configuration'

import { CompletionCallbacks, CompletionParameters, CompletionResponse, Event } from './types'

export interface CompletionLogger {
    startCompletion(
        params: CompletionParameters | {},
        endpoint: string
    ):
        | undefined
        | {
              onError: (error: string, rawError?: unknown) => void
              onComplete: (response: string | CompletionResponse | string[] | CompletionResponse[]) => void
              onEvents: (events: Event[]) => void
          }
}

export type CompletionsClientConfig = Pick<
    ConfigurationWithAccessToken,
    'serverEndpoint' | 'accessToken' | 'debugEnable' | 'customHeaders'
>

/**
 * Access the chat based LLM APIs via a Sourcegraph server instance.
 */
export abstract class SourcegraphCompletionsClient {
    private errorEncountered = false

    constructor(
        protected config: CompletionsClientConfig,
        protected logger?: CompletionLogger
    ) {}

    public onConfigurationChange(newConfig: CompletionsClientConfig): void {
        this.config = newConfig
    }

    protected get completionsEndpoint(): string {
        return new URL('/.api/completions/stream', this.config.serverEndpoint).href
    }

    protected sendEvents(events: Event[], cb: CompletionCallbacks): void {
        for (const event of events) {
            switch (event.type) {
                case 'completion':
                    cb.onChange(event.completion)
                    break
                case 'error':
                    this.errorEncountered = true
                    cb.onError(new Error(event.error))
                    break
                case 'done':
                    if (!this.errorEncountered) {
                        cb.onComplete()
                    }
                    // reset errorEncountered for next request
                    this.errorEncountered = false
                    break
            }
        }
    }

    public abstract stream(params: CompletionParameters, cb: CompletionCallbacks): () => void
}

/**
 * A helper function that calls the streaming API but will buffer the result
 * until the stream has completed.
 */
export function bufferStream(
    client: Pick<SourcegraphCompletionsClient, 'stream'>,
    params: CompletionParameters
): Promise<string> {
    return new Promise((resolve, reject) => {
        let buffer = ''
        const callbacks: CompletionCallbacks = {
            onChange(text: string) {
                buffer = text
            },
            onComplete() {
                resolve(buffer)
            },
            onError(error: Error, code?: number) {
                reject(code ? new Error(`${error} (code ${code})`) : error)
            },
        }
        client.stream(params, callbacks)
    })
}
