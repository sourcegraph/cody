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

    public async complete(
        params: CompletionParameters,
        onPartialResponse?: (incompleteResponse: CompletionResponse) => void,
        signal?: AbortSignal
    ): Promise<CompletionResponse> {
        const log = this.logger?.startCompletion(params)

        const headers = new Headers(this.config.customHeaders)
        if (this.config.accessToken) {
            headers.set('Authorization', `token ${this.config.accessToken}`)
        }

        // We enable streaming only for Node environments right now because it's hard to make the
        // polyfilled fetch API work the same as it does in the browser.
        //
        // @TODO(philipp-spiess): Feature test if the response is a Node or a browser stream and
        // implement SSE parsing for both.
        const isNode = typeof process !== 'undefined'
        const enableStreaming = !!isNode

        const response = await fetch(this.codeCompletionsEndpoint, {
            method: 'POST',
            body: JSON.stringify({
                ...params,
                stream: enableStreaming,
            }),
            headers,
            signal,
        })

        // When rate-limiting occurs, the response is an error message
        if (response.status === 429) {
            throw new Error(await response.text())
        }

        if (response.body === null) {
            throw new Error('No response body')
        }

        // For backward compatibility, we have to check if the response is an SSE stream or a
        // regular JSON payload. This ensures that the request also works against older backends
        const isStreamingResponse = response.headers.get('content-type') === 'text/event-stream'

        if (isStreamingResponse) {
            try {
                const iterator = createSSEDecoder(response.body as any)

                let lastResponse: CompletionResponse | undefined
                for await (const chunk of iterator) {
                    if (chunk.event === 'completion') {
                        lastResponse = JSON.parse(chunk.data) as CompletionResponse
                        onPartialResponse?.(lastResponse)
                    }
                }

                if (lastResponse === undefined) {
                    throw new Error('No completion response received')
                }

                return lastResponse
            } catch (error) {
                const message = `error parsing streaming CodeCompletionResponse: ${error}`
                log?.onError(message)
                throw new Error(message)
            }
        } else {
            const result = await response.text()
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
    }

    public abstract stream(params: CompletionParameters, cb: CompletionCallbacks): () => void
}

interface SSEMessage {
    event: string
    data: string
}

async function* createSSEDecoder(iterator: AsyncIterableIterator<BufferSource>): AsyncGenerator<SSEMessage> {
    let buffer = ''
    for await (const event of iterator) {
        const messages: SSEMessage[] = []

        const data = new TextDecoder().decode(event)
        buffer += data

        let index: number
        while ((index = buffer.indexOf('\n\n')) >= 0) {
            const message = buffer.slice(0, index)
            buffer = buffer.slice(index + 2)
            messages.push(parseSSEEvent(message))
        }

        // This is a potential optimization because our current backend includes a repetition of the
        // whole prior completion in each event. If more than one event is detected inside a chunk,
        // we can skip all but the last completion events.
        for (let i = 0; i < messages.length; i++) {
            if (
                i + 1 < messages.length &&
                messages[i].event === 'completion' &&
                messages[i + 1].event === 'completion'
            ) {
                continue
            }

            yield messages[i]
        }
    }
}

function parseSSEEvent(message: string): SSEMessage {
    const headers = message.split('\n')

    let event = ''
    let data = ''
    for (const header of headers) {
        const index = header.indexOf(': ')
        const title = header.slice(0, index)
        const rest = header.slice(index + 2)
        switch (title) {
            case 'event':
                event = rest
                break
            case 'data':
                data = rest
                break
            default:
                console.error(`Unknown SSE event type: ${event}`)
        }
    }

    return { event, data }
}
