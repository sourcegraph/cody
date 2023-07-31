import { ConfigurationWithAccessToken } from '../../configuration'

import { CompletionCallbacks, CompletionParameters, CompletionResponse, Event } from './types'

export interface CompletionLogger {
    startCompletion(params: CompletionParameters | {}):
        | undefined
        | {
              onError: (error: string) => void
              onComplete: (response: string | CompletionResponse | string[] | CompletionResponse[]) => void
              onEvents: (events: Event[]) => void
          }
}

export type CompletionsClientConfig = Pick<
    ConfigurationWithAccessToken,
    'serverEndpoint' | 'accessToken' | 'debugEnable' | 'customHeaders'
>

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

    protected get codeCompletionsEndpoint(): string {
        return new URL('/.api/completions/code', this.config.serverEndpoint).href
    }

    protected sendEvents(events: Event[], cb: CompletionCallbacks): void {
        for (const event of events) {
            switch (event.type) {
                case 'completion':
                    cb.onChange(event.completion)
                    break
                case 'error':
                    this.errorEncountered = true
                    cb.onError(event.error)
                    break
                case 'done':
                    if (!this.errorEncountered) {
                        cb.onComplete()
                    }
                    break
            }
        }
    }

    public async complete(params: CompletionParameters, abortSignal?: AbortSignal): Promise<CompletionResponse> {
        const log = this.logger?.startCompletion(params)

        const headers = new Headers(this.config.customHeaders as HeadersInit)
        if (this.config.accessToken) {
            headers.set('Authorization', `token ${this.config.accessToken}`)
        }

        const response = await fetch(this.codeCompletionsEndpoint, {
            method: 'POST',
            body: JSON.stringify(params),
            headers,
            signal: abortSignal,
        })

        const result = await response.text()

        // When rate-limiting occurs, the response is an error message
        if (response.status === 429) {
            throw new Error(result)
        }

        try {
            const response = JSON.parse(result) as CompletionResponse

            if (typeof response.completion !== 'string' || typeof response.stopReason !== 'string') {
                const message = `response does not satisfy CodeCompletionResponse: ${result}`
                log?.onError(message)
                throw new Error(message)
            } else {
                log?.onComplete(response)
                return response
            }
        } catch (error) {
            const message = `error parsing response CodeCompletionResponse: ${error}, response text: ${result}`
            log?.onError(message)
            throw new Error(message)
        }
    }

    public abstract stream(params: CompletionParameters, cb: CompletionCallbacks): () => void
}
