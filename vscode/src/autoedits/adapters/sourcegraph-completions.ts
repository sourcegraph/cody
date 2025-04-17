import type {
    CodeCompletionsClient,
    CodeCompletionsParams,
    CompletionResponseGenerator,
    Message,
    ModelRefStr,
} from '@sourcegraph/cody-shared'

import { defaultCodeCompletionsClient } from '../../completions/default-client'
import { forkSignal } from '../../completions/utils'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'

import {
    type AutoeditModelOptions,
    AutoeditStopReason,
    type AutoeditsModelAdapter,
    type ModelResponse,
} from './base'
import { getMaxOutputTokensForAutoedits, getSourcegraphCompatibleChatPrompt } from './utils'

export class SourcegraphCompletionsAdapter implements AutoeditsModelAdapter {
    private client: CodeCompletionsClient

    constructor() {
        this.client = defaultCodeCompletionsClient.instance!
    }
    dispose() {}

    async getModelResponse(options: AutoeditModelOptions): Promise<AsyncGenerator<ModelResponse>> {
        try {
            const maxTokens = getMaxOutputTokensForAutoedits(options.codeToRewrite)
            const messages: Message[] = getSourcegraphCompatibleChatPrompt({
                systemMessage: options.prompt.systemMessage,
                userMessage: options.prompt.userMessage,
            })
            const requestBody: CodeCompletionsParams = {
                timeoutMs: 5_000,
                model: options.model as ModelRefStr,
                messages,
                maxTokensToSample: maxTokens,
                temperature: 0.1,
                prediction: {
                    type: 'content',
                    content: options.codeToRewrite,
                },
            }

            const abortController = forkSignal(options.abortSignal)
            const completionResponseGenerator = await this.client.complete(requestBody, abortController)
            return this.processCompletionResponse(completionResponseGenerator, options, requestBody)
        } catch (error) {
            autoeditsOutputChannelLogger.logError(
                'getModelResponse',
                'Error calling Sourcegraph Completions:',
                { verbose: error }
            )
            throw error
        }
    }

    private async *processCompletionResponse(
        completionResponseGenerator: CompletionResponseGenerator,
        options: AutoeditModelOptions,
        requestBody: CodeCompletionsParams
    ): AsyncGenerator<ModelResponse> {
        let prediction = ''
        let responseBody: any = null
        let responseHeaders: Record<string, string> = {}
        let requestHeaders: Record<string, string> = {}
        let requestUrl = options.url
        let isAborted = false

        for await (const msg of completionResponseGenerator) {
            const newText = msg.completionResponse?.completion
            if (newText) {
                prediction = newText
            }

            // Capture response metadata if available
            if (msg.metadata) {
                if (msg.metadata.response) {
                    // Extract headers into a plain object
                    responseHeaders = {}
                    msg.metadata.response.headers.forEach((value, key) => {
                        responseHeaders[key] = value
                    })
                }

                // Capture request metadata
                if (msg.metadata.requestHeaders) {
                    requestHeaders = msg.metadata.requestHeaders
                }

                if (msg.metadata.requestUrl) {
                    requestUrl = msg.metadata.requestUrl
                }

                if (msg.metadata.isAborted) {
                    isAborted = true
                }

                // Store the full response body if available
                if (msg.completionResponse) {
                    responseBody = msg.completionResponse
                }
            }

            yield {
                type: 'partial',
                stopReason: AutoeditStopReason.StreamingChunk,
                prediction,
                requestUrl,
                requestHeaders,
                responseHeaders,
                responseBody,
            }
        }

        const sharedResult = {
            responseHeaders,
            requestHeaders,
            requestUrl,
            requestBody,
            responseBody,
        }

        if (isAborted) {
            yield {
                ...sharedResult,
                type: 'aborted',
                stopReason: AutoeditStopReason.RequestAborted,
            }
        }

        yield {
            ...sharedResult,
            type: 'success',
            stopReason: AutoeditStopReason.RequestFinished,
            prediction,
        }
    }
}
