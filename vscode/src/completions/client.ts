import { FeatureFlag, type FeatureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'
import type {
    CompletionLogger,
    CompletionsClientConfig,
} from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/client'
import type {
    CompletionParameters,
    CompletionResponse,
} from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

export type CodeCompletionsParams = Omit<CompletionParameters, 'fast'>

export interface CodeCompletionsClient {
    complete(
        params: CodeCompletionsParams,
        onPartialResponse?: (incompleteResponse: CompletionResponse) => void,
        signal?: AbortSignal
    ): Promise<CompletionResponse>
    onConfigurationChange(newConfig: CompletionsClientConfig): void
}

/**
 * Access the code completion LLM APIs via a Sourcegraph server instance.
 */
export function createClient(
    config: CompletionsClientConfig,
    featureFlagProvider?: FeatureFlagProvider,
    logger?: CompletionLogger
): CodeCompletionsClient {
    function getCodeCompletionsEndpoint(): string {
        return new URL('/.api/completions/code', config.serverEndpoint).href
    }

    return {
        async complete(params, onPartialResponse, signal): Promise<CompletionResponse> {
            const log = logger?.startCompletion(params)

            const headers = new Headers(config.customHeaders)
            if (config.accessToken) {
                headers.set('Authorization', `token ${config.accessToken}`)
            }

            // We enable streaming only for Node environments right now because it's hard to make the
            // polyfilled fetch API work the same as it does in the browser.
            //
            // @TODO(philipp-spiess): Feature test if the response is a Node or a browser stream and
            // implement SSE parsing for both.
            const isNode = typeof process !== 'undefined'
            const isFeatureFlagEnabled = featureFlagProvider
                ? await featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteStreamingResponse)
                : false
            const enableStreaming = !!isNode && isFeatureFlagEnabled

            const response = await fetch(getCodeCompletionsEndpoint(), {
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
                    // The any cast is necessary because `node-fetch` (The polyfill for fetch we use via
                    // `isomorphic-fetch`) does not implement a proper ReadableStream interface but
                    // instead exposes a Node Stream.
                    //
                    // Since we directly require from `isomporphic-fetch` and gate this branch out from
                    // non Node environments, the response.body will always be a Node Stream instead
                    const iterator = createSSEIterator(response.body as any as AsyncIterableIterator<BufferSource>)

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
        },
        onConfigurationChange(newConfig) {
            config = newConfig
        },
    }
}

interface SSEMessage {
    event: string
    data: string
}

const SSE_TERMINATOR = '\n\n'
export async function* createSSEIterator(iterator: AsyncIterableIterator<BufferSource>): AsyncGenerator<SSEMessage> {
    let buffer = ''
    for await (const event of iterator) {
        const messages: SSEMessage[] = []

        const data = new TextDecoder().decode(event)
        buffer += data

        let index: number
        while ((index = buffer.indexOf(SSE_TERMINATOR)) >= 0) {
            const message = buffer.slice(0, index)
            buffer = buffer.slice(index + SSE_TERMINATOR.length)
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
