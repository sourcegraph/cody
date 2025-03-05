import type {
    CodeCompletionsClient,
    CodeCompletionsParams,
    Message,
    ModelRefStr,
} from '@sourcegraph/cody-shared'
import { defaultCodeCompletionsClient } from '../../completions/default-client'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'
import type { AutoeditModelOptions, AutoeditsModelAdapter, ModelResponse } from './base'
import { getMaxOutputTokensForAutoedits, getSourcegraphCompatibleChatPrompt } from './utils'

export class SourcegraphCompletionsAdapter implements AutoeditsModelAdapter {
    private client: CodeCompletionsClient

    constructor() {
        this.client = defaultCodeCompletionsClient.instance!
    }

    async getModelResponse(option: AutoeditModelOptions): Promise<ModelResponse> {
        try {
            const maxTokens = getMaxOutputTokensForAutoedits(option.codeToRewrite)
            const messages: Message[] = getSourcegraphCompatibleChatPrompt({
                systemMessage: option.prompt.systemMessage,
                userMessage: option.prompt.userMessage,
            })
            const requestBody: CodeCompletionsParams = {
                timeoutMs: 5_000,
                model: option.model as ModelRefStr,
                messages,
                maxTokensToSample: maxTokens,
                temperature: 0.1,
                prediction: {
                    type: 'content',
                    content: option.codeToRewrite,
                },
            }

            // Create an AbortController to pass to the client
            const abortController = new AbortController()

            const completionResponseGenerator = await this.client.complete(requestBody, abortController)

            let prediction = ''
            let responseBody: any = null
            let responseHeaders: Record<string, string> = {}
            let requestHeaders: Record<string, string> = {}
            let requestUrl = option.url

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
                    }
                }
            }

            return {
                prediction,
                responseHeaders,
                requestHeaders,
                requestUrl,
                requestBody,
                responseBody,
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
