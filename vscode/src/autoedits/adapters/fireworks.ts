import { createSSEIterator, fetch, isAbortError, isNodeResponse } from '@sourcegraph/cody-shared'
import { autoeditsProviderConfig } from '../autoedits-config'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'

import type {
    AbortedModelResponse,
    AutoeditModelOptions,
    AutoeditsModelAdapter,
    ModelResponse,
    ModelResponseShared,
    SuccessModelResponse,
} from './base'
import {
    type AutoeditsRequestBody,
    type FireworksCompatibleRequestParams,
    getMaxOutputTokensForAutoedits,
    getModelResponse,
    getOpenaiCompatibleChatPrompt,
} from './utils'

export class FireworksAdapter implements AutoeditsModelAdapter {
    async *generateModelResponses(option: AutoeditModelOptions): AsyncGenerator<ModelResponse> {
        const requestBody = this.getMessageBody(option)

        try {
            const apiKey = autoeditsProviderConfig.experimentalAutoeditsConfigOverride?.apiKey

            if (!apiKey) {
                autoeditsOutputChannelLogger.logError(
                    'generateModelResponses',
                    'No api key provided in the config override'
                )
                throw new Error('No api key provided in the config override')
            }

            const requestHeaders = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
                'Accept-Encoding': 'gzip;q=0', // Disable gzip to prevent batching
            }

            const partialResult = {
                requestHeaders,
                requestUrl: option.url,
                requestBody,
            }

            const response = await fetch(option.url, {
                method: 'POST',
                headers: requestHeaders,
                body: JSON.stringify(requestBody),
                signal: option.abortSignal,
            })

            if (response.status !== 200) {
                const errorText = await response.text()
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`)
            }

            if (!response.body) {
                throw new Error('No response body')
            }

            // Extract headers into a plain object
            const responseHeaders: Record<string, string> = {}
            response.headers.forEach((value, key) => {
                responseHeaders[key] = value
            })

            // Check if we're in Node.js environment and can use createSSEIterator
            const isStreamingResponse = response.headers
                .get('content-type')
                ?.startsWith('text/event-stream')

            console.log('VARS:', {
                isStreamingResponse,
                isNodeResponse: isNodeResponse(response),
            })
            if (isStreamingResponse && isNodeResponse(response)) {
                console.log('WE ARE STREAMING???')
                // Process the streaming response for Node.js
                const iterator = createSSEIterator(response.body, { aggregatedCompletionEvent: false })
                let accumulatedText = ''

                for await (const { data } of iterator) {
                    try {
                        if (option.abortSignal.aborted) {
                            yield { ...partialResult, type: 'aborted' }
                            return
                        }

                        const parsed = JSON.parse(data)
                        let chunk = ''

                        if (option.isChatModel) {
                            if (parsed.choices?.[0]?.delta?.content) {
                                chunk = parsed.choices[0].delta.content
                            } else if (parsed.choices?.[0]?.message?.content) {
                                chunk = parsed.choices[0].message.content
                            }
                        } else {
                            if (parsed.choices?.[0]?.text) {
                                chunk = parsed.choices[0].text
                            }
                        }

                        console.log('chunk', chunk)
                        if (chunk) {
                            accumulatedText += chunk
                            yield {
                                ...partialResult,
                                type: 'success',
                                responseBody: parsed,
                                responseHeaders,
                                prediction: accumulatedText,
                            }
                        }
                    } catch (error) {
                        autoeditsOutputChannelLogger.logError(
                            'generateModelResponses',
                            'Error parsing JSON:',
                            {
                                verbose: error,
                            }
                        )
                    }
                }
            } else {
                console.log('WE ARE NOT STREAMING')
                // For non-Node environments or non-streaming responses, handle as a single response
                try {
                    const responseBody = await response.json()
                    let prediction: string

                    if (option.isChatModel) {
                        prediction = responseBody.choices[0].message.content
                    } else {
                        prediction = responseBody.choices[0].text
                    }

                    yield {
                        ...partialResult,
                        type: 'success',
                        responseBody,
                        responseHeaders,
                        prediction,
                    }
                } catch (error) {
                    autoeditsOutputChannelLogger.logError(
                        'generateModelResponses',
                        'Error handling non-streaming response:',
                        {
                            verbose: error,
                        }
                    )
                    throw error
                }
            }
        } catch (error) {
            if (isAbortError(error)) {
                yield { type: 'aborted', requestUrl: option.url }
                return
            }

            autoeditsOutputChannelLogger.logError(
                'generateModelResponses',
                'Error streaming from Fireworks API:',
                {
                    verbose: error,
                }
            )
            throw error
        }
    }

    async getModelResponse(option: AutoeditModelOptions): Promise<ModelResponse> {
        const requestBody = this.getMessageBody(option)
        try {
            const apiKey = autoeditsProviderConfig.experimentalAutoeditsConfigOverride?.apiKey

            if (!apiKey) {
                autoeditsOutputChannelLogger.logError(
                    'getModelResponse',
                    'No api key provided in the config override'
                )
                throw new Error('No api key provided in the config override')
            }
            const response = await this.sendModelRequest({
                url: option.url,
                body: requestBody,
                apiKey,
                abortSignal: option.abortSignal,
            })

            if (response.type === 'aborted') {
                return response
            }

            let prediction: string
            if (option.isChatModel) {
                prediction = response.responseBody.choices[0].message.content
            } else {
                prediction = response.responseBody.choices[0].text
            }

            return {
                ...response,
                prediction,
            }
        } catch (error) {
            autoeditsOutputChannelLogger.logError('getModelResponse', 'Error calling Fireworks API:', {
                verbose: error,
            })
            throw error
        }
    }

    dispose() {}

    protected async sendModelRequest({
        apiKey,
        url,
        body,
        abortSignal,
        customHeaders = {},
    }: {
        apiKey: string
        url: string
        body: ModelResponseShared['requestBody']
        abortSignal: AbortSignal
        customHeaders?: Record<string, string>
    }): Promise<Omit<SuccessModelResponse, 'prediction'> | AbortedModelResponse> {
        return getModelResponse({
            apiKey,
            url,
            body,
            abortSignal,
            customHeaders,
        })
    }

    private getMessageBody(options: AutoeditModelOptions): AutoeditsRequestBody {
        const maxTokens = getMaxOutputTokensForAutoedits(options.codeToRewrite)
        const baseParams: FireworksCompatibleRequestParams = {
            stream: true,
            model: options.model,
            temperature: 0.1,
            max_tokens: maxTokens,
            response_format: {
                type: 'text',
            },
            // Fireworks Predicted outputs
            // https://docs.fireworks.ai/guides/querying-text-models#predicted-outputs
            prediction: {
                type: 'content',
                content: options.codeToRewrite,
            },
            user: options.userId || undefined,
        }

        if (options.isChatModel) {
            return {
                ...baseParams,
                messages: getOpenaiCompatibleChatPrompt({
                    systemMessage: options.prompt.systemMessage,
                    userMessage: options.prompt.userMessage,
                }),
            }
        }

        return {
            ...baseParams,
            prompt: options.prompt.userMessage,
        }
    }
}
