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
import { SHA256, enc } from 'crypto-js'

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
            signal: abortController.signal,
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

        if (isStreamingResponse && isNodeResponse(response)) {
            let lastResponse: CompletionResponse | undefined
            try {
                const iterator = createSSEIterator(response.body, { batchCompletionEvents: true })
                let chunkIndex = 0

                for await (const { event, data } of iterator) {
                    if (event === 'error') {
                        throw new Error(data)
                    }

                    if (event === 'completion') {
                        if (abortController.signal.aborted) {
                            break // Stop processing the already received chunks.
                        }

                        lastResponse = JSON.parse(data) as CompletionResponse

                        if (!lastResponse.stopReason) {
                            lastResponse.stopReason = STOP_REASON_STREAMING_CHUNK
                        }

                        yield lastResponse
                    }

                    chunkIndex += 1
                }

                if (lastResponse === undefined) {
                    throw new TracedError('No completion response received', traceId)
                }
                log?.onComplete(lastResponse)

                return lastResponse
            } catch (error) {
                if (isRateLimitError(error as Error)) {
                    throw error
                }
                if (isAbortError(error as Error) && lastResponse) {
                    log?.onComplete(lastResponse)
                }

                const message = `error parsing streaming CodeCompletionResponse: ${error}`
                log?.onError(message, error)
                throw new TracedError(message, traceId)
            }
        } else {
            const result = await response.text()
            try {
                const response = JSON.parse(result) as CompletionResponse

                if (typeof response.completion !== 'string' || typeof response.stopReason !== 'string') {
                    const message = `response does not satisfy CodeCompletionResponse: ${result}`
                    log?.onError(message)
                    throw new TracedError(message, traceId)
                }
                log?.onComplete(response)
                return response
            } catch (error) {
                const message = `error parsing response CodeCompletionResponse: ${error}, response text: ${result}`
                log?.onError(message, error)
                throw new TracedError(message, traceId)
            }
        }
    }

    return {
        complete,
        serverEndpoint: config.serverEndpoint,
        codyGatewayAccessToken: config.accessToken
            ? dotcomTokenToGatewayToken(config.accessToken)
            : undefined,
        logger,
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
export async function* createSSEIterator(
    iterator: NodeJS.ReadableStream,
    options: { batchCompletionEvents?: boolean } = {}
): AsyncGenerator<SSEMessage> {
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

        for (let i = 0; i < messages.length; i++) {
            // This is a potential optimization because our current backend includes a repetition of the
            // whole prior completion in each event. If more than one event is detected inside a chunk,
            // we can skip all but the last completion events.
            if (options.batchCompletionEvents) {
                if (
                    i + 1 < messages.length &&
                    messages[i].event === 'completion' &&
                    messages[i + 1].event === 'completion'
                ) {
                    continue
                }
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

function dotcomTokenToGatewayToken(dotcomToken: string): string | undefined {
    const DOTCOM_TOKEN_REGEX: RegExp =
        /^(?:sgph?_)?(?:[\da-fA-F]{16}_|local_)?(?<hexbytes>[\da-fA-F]{40})$/
    const match = DOTCOM_TOKEN_REGEX.exec(dotcomToken)

    if (!match) {
        throw new Error('Access token format is invalid.')
    }

    const hexEncodedAccessTokenBytes = match?.groups?.hexbytes

    if (!hexEncodedAccessTokenBytes) {
        throw new Error('Access token not found.')
    }

    const accessTokenBytes = enc.Hex.parse(hexEncodedAccessTokenBytes)
    const gatewayTokenBytes = SHA256(SHA256(accessTokenBytes)).toString()
    return 'sgd_' + gatewayTokenBytes
}
