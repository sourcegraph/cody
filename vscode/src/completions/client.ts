import {
    FeatureFlag,
    NetworkError,
    RateLimitError,
    STOP_REASON_STREAMING_CHUNK,
    TracedError,
    addTraceparent,
    featureFlagProvider,
    getActiveTraceAndSpanId,
    isAbortError,
    isNodeResponse,
    isRateLimitError,
    type CodeCompletionsClient,
    type CodeCompletionsParams,
    type CompletionLogger,
    type CompletionResponse,
    type CompletionResponseGenerator,
    type CompletionsClientConfig,
} from '@sourcegraph/cody-shared'

import { fetch } from '../fetch'
import {
    STOP_REASON_REQUEST_ABORTED,
    STOP_REASON_REQUEST_FINISHED,
} from '@sourcegraph/cody-shared/src/inferenceClient/misc'

/**
 * Access the code completion LLM APIs via a Sourcegraph server instance.
 */
export function createClient(
    config: CompletionsClientConfig,
    logger?: CompletionLogger
): CodeCompletionsClient {
    async function* complete(
        params: CodeCompletionsParams,
        abortController: AbortController
    ): CompletionResponseGenerator {
        const url = new URL('/.api/completions/code', config.serverEndpoint).href
        const log = logger?.startCompletion(params, url)
        const { signal } = abortController

        const tracingFlagEnabled = await featureFlagProvider.evaluateFeatureFlag(
            FeatureFlag.CodyAutocompleteTracing
        )

        const headers = new Headers(config.customHeaders)
        // Force HTTP connection reuse to reduce latency.
        // c.f. https://github.com/microsoft/vscode/issues/173861
        headers.set('Connection', 'keep-alive')
        headers.set('Content-Type', 'application/json; charset=utf-8')
        if (config.accessToken) {
            headers.set('Authorization', `token ${config.accessToken}`)
        }
        if (tracingFlagEnabled) {
            headers.set('X-Sourcegraph-Should-Trace', '1')

            addTraceparent(headers)
        }

        // We enable streaming only for Node environments right now because it's hard to make
        // the polyfilled fetch API work the same as it does in the browser.
        //
        // TODO(philipp-spiess): Feature test if the response is a Node or a browser stream and
        // implement SSE parsing for both.
        const isNode = typeof process !== 'undefined'
        const enableStreaming = !!isNode

        // Disable gzip compression since the sg instance will start to batch
        // responses afterwards.
        if (enableStreaming) {
            headers.set('Accept-Encoding', 'gzip;q=0')
        }

        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({
                ...params,
                stream: enableStreaming,
            }),
            headers,
            signal,
        })

        const traceId = getActiveTraceAndSpanId()?.traceId

        // When rate-limiting occurs, the response is an error message
        if (response.status === 429) {
            // Check for explicit false, because if the header is not set, there
            // is no upgrade available.
            const upgradeIsAvailable =
                response.headers.get('x-is-cody-pro-user') === 'false' &&
                typeof response.headers.get('x-is-cody-pro-user') !== 'undefined'
            const retryAfter = response.headers.get('retry-after')
            const limit = response.headers.get('x-ratelimit-limit')
            throw new RateLimitError(
                'autocompletions',
                await response.text(),
                upgradeIsAvailable,
                limit ? parseInt(limit, 10) : undefined,
                retryAfter
            )
        }

        if (!response.ok) {
            throw new NetworkError(response, await response.text(), traceId)
        }

        if (response.body === null) {
            throw new TracedError('No response body', traceId)
        }

        // For backward compatibility, we have to check if the response is an SSE stream or a
        // regular JSON payload. This ensures that the request also works against older backends
        const isStreamingResponse = response.headers.get('content-type') === 'text/event-stream'

        let completionResponse: CompletionResponse | undefined = undefined

        try {
            if (isStreamingResponse && isNodeResponse(response)) {
                const iterator = createSSEIterator(response.body)
                let chunkIndex = 0

                for await (const { event, data } of iterator) {
                    if (event === 'error') {
                        throw new Error(data)
                    }

                    if (signal.aborted) {
                        if (completionResponse) {
                            completionResponse.stopReason = STOP_REASON_REQUEST_ABORTED
                        }

                        break
                    }

                    if (event === 'completion') {
                        completionResponse = JSON.parse(data) as CompletionResponse

                        yield {
                            completion: completionResponse.completion,
                            stopReason: completionResponse.stopReason || STOP_REASON_STREAMING_CHUNK,
                        }
                    }

                    chunkIndex += 1
                }

                if (completionResponse === undefined) {
                    throw new TracedError('No completion response received', traceId)
                }

                if (!completionResponse.stopReason) {
                    completionResponse.stopReason = STOP_REASON_REQUEST_FINISHED
                }

                log?.onComplete(completionResponse)

                return completionResponse
            }

            // Handle non-streaming response
            const result = await response.text()
            completionResponse = JSON.parse(result) as CompletionResponse

            if (
                typeof completionResponse.completion !== 'string' ||
                typeof completionResponse.stopReason !== 'string'
            ) {
                const message = `response does not satisfy CodeCompletionResponse: ${result}`
                log?.onError(message)
                throw new TracedError(message, traceId)
            }

            log?.onComplete(completionResponse)
            return completionResponse
        } catch (error) {
            // Shared error handling for both streaming and non-streaming requests.
            if (isRateLimitError(error as Error)) {
                throw error
            }

            if (isAbortError(error as Error) && completionResponse) {
                log?.onComplete(completionResponse)
            }

            const message = `error parsing CodeCompletionResponse: ${error}`
            log?.onError(message, error)
            throw new TracedError(message, traceId)
        }
    }

    return {
        complete,
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
export async function* createSSEIterator(iterator: NodeJS.ReadableStream): AsyncGenerator<SSEMessage> {
    let buffer = ''
    for await (const event of iterator) {
        const messages: SSEMessage[] = []

        buffer += event.toString()

        let index: number
        // biome-ignore lint/suspicious/noAssignInExpressions: useful
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
