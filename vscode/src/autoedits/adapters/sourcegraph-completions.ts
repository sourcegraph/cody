import type {
    CodeCompletionsClient,
    CodeCompletionsParams,
    Message,
    ModelRefStr,
} from '@sourcegraph/cody-shared'

import { defaultCodeCompletionsClient } from '../../completions/default-client'
import { forkSignal } from '../../completions/utils'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'

import type { AutoeditModelOptions, AutoeditsModelAdapter, ModelResponse } from './base'
import { getMaxOutputTokensForAutoedits, getSourcegraphCompatibleChatPrompt } from './utils'

export class SourcegraphCompletionsAdapter implements AutoeditsModelAdapter {
    private client: CodeCompletionsClient

    constructor() {
        this.client = defaultCodeCompletionsClient.instance!
    }

    async getModelResponse(options: AutoeditModelOptions): Promise<ModelResponse> {
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

            let prediction = ''
            let responseBody: any = null
            let responseHeaders: Record<string, string> = {}
            let requestHeaders: Record<string, string> = {}
            let requestUrl = options.url
            let stopReason: string | undefined = undefined

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

                    // Store the full response body if available
                    if (msg.completionResponse) {
                        responseBody = msg.completionResponse
                        stopReason = msg.completionResponse.stopReason
                    }
                }
            }

            const sharedResult = {
                responseHeaders,
                requestHeaders,
                requestUrl,
                requestBody,
                responseBody,
            }

            if (stopReason === 'cody-request-aborted') {
                return {
                    ...sharedResult,
                    type: 'aborted',
                }
            }

            return {
                ...sharedResult,
                type: 'success',
                prediction,
            }
        } catch (error) {
            autoeditsOutputChannelLogger.logError(
                'getModelResponse',
                'Error calling Sourcegraph Completions:',
                { verbose: error }
            )
            throw error
        }
    }
}
