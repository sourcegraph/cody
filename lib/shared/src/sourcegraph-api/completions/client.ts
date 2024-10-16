import type { Span } from '@opentelemetry/api'

import { type FireworksCodeCompletionParams, addClientInfoParams, getSerializedParams } from '../..'
import { currentResolvedConfig } from '../../configuration/resolver'
import { useCustomChatClient } from '../../llm-providers'
import { recordErrorToSpan } from '../../tracing'

import type {
    CompletionCallbacks,
    CompletionGeneratorValue,
    CompletionParameters,
    CompletionResponse,
    Event,
    SerializedCompletionParameters,
} from './types'

export interface CompletionLogger {
    startCompletion(
        params: CompletionParameters | unknown,
        endpoint: string
    ):
        | undefined
        | {
              onError: (error: string, rawError?: unknown) => void
              onComplete: (response: CompletionResponse) => void
              onEvents: (events: Event[]) => void
              onFetch: (
                  httpClientLabel: string,
                  body: SerializedCompletionParameters | FireworksCodeCompletionParams
              ) => void
          }
}

export interface CompletionRequestParameters {
    apiVersion: number
    customHeaders?: Record<string, string>
}

/**
 * Access the chat based LLM APIs via a Sourcegraph server instance.
 *
 * 🚨 SECURITY: It is the caller's responsibility to ensure context from
 * all cody ignored files are removed before sending requests to the server.
 */
export abstract class SourcegraphCompletionsClient {
    private errorEncountered = false

    protected readonly isTemperatureZero = process.env.CODY_TEMPERATURE_ZERO === 'true'

    constructor(protected logger?: CompletionLogger) {}

    protected async completionsEndpoint(): Promise<string> {
        return new URL('/.api/completions/stream', (await currentResolvedConfig()).auth.serverEndpoint)
            .href
    }

    protected sendEvents(events: Event[], cb: CompletionCallbacks, span?: Span): void {
        for (const event of events) {
            switch (event.type) {
                case 'completion': {
                    span?.addEvent('yield', { stopReason: event.stopReason })
                    cb.onChange(event.completion)
                    break
                }
                case 'error': {
                    const error = new Error(event.error)
                    if (span) {
                        recordErrorToSpan(span, error)
                    }
                    this.errorEncountered = true
                    cb.onError(error)
                    break
                }
                case 'done': {
                    if (!this.errorEncountered) {
                        cb.onComplete()
                    }
                    // reset errorEncountered for next request
                    this.errorEncountered = false
                    span?.end()
                    break
                }
            }
        }
    }

    protected async prepareRequest(
        params: CompletionParameters,
        requestParams: CompletionRequestParameters
    ): Promise<{ url: URL; serializedParams: SerializedCompletionParameters }> {
        const { apiVersion } = requestParams
        const serializedParams = await getSerializedParams(params)
        const url = new URL(await this.completionsEndpoint())
        if (apiVersion >= 1) {
            url.searchParams.append('api-version', '' + apiVersion)
        }
        addClientInfoParams(url.searchParams)
        return { url, serializedParams }
    }

    protected abstract _fetchWithCallbacks(
        params: CompletionParameters,
        requestParams: CompletionRequestParameters,
        cb: CompletionCallbacks,
        signal?: AbortSignal
    ): Promise<void>

    protected abstract _streamWithCallbacks(
        params: CompletionParameters,
        requestParams: CompletionRequestParameters,
        cb: CompletionCallbacks,
        signal?: AbortSignal
    ): Promise<void>

    public async *stream(
        params: CompletionParameters,
        requestParams: CompletionRequestParameters,
        signal?: AbortSignal
    ): AsyncGenerator<CompletionGeneratorValue> {
        // Provide default stop sequence for starchat models.
        if (!params.stopSequences && params?.model?.startsWith('openaicompatible/starchat')) {
            params.stopSequences = ['<|end|>']
        }

        // This is a technique to convert a function that takes callbacks to an async generator.
        const values: Promise<CompletionGeneratorValue>[] = []
        let resolve: ((value: CompletionGeneratorValue) => void) | undefined
        values.push(
            new Promise(r => {
                resolve = r
            })
        )

        const send = (value: CompletionGeneratorValue): void => {
            resolve!(value)
            values.push(
                new Promise(r => {
                    resolve = r
                })
            )
        }
        const callbacks: CompletionCallbacks = {
            onChange(text) {
                send({ type: 'change', text })
            },
            onComplete() {
                send({ type: 'complete' })
            },
            onError(error, statusCode) {
                send({ type: 'error', error, statusCode })
            },
        }

        // Custom chat clients for Non-Sourcegraph-supported providers.
        const isNonSourcegraphProvider = await useCustomChatClient({
            completionsEndpoint: await this.completionsEndpoint(),
            params,
            cb: callbacks,
            logger: this.logger,
            signal,
        })

        if (!isNonSourcegraphProvider) {
            if (params.stream === false) {
                await this._fetchWithCallbacks(params, requestParams, callbacks, signal)
            } else {
                await this._streamWithCallbacks(params, requestParams, callbacks, signal)
            }
        }

        for (let i = 0; ; i++) {
            const val = await values[i]
            delete values[i]
            yield val
            if (val.type === 'complete' || val.type === 'error') {
                break
            }
        }
    }
}
