import type { CodeCompletionsParams, PromptString } from '@sourcegraph/cody-shared'
import type { AutoeditsRequestBody } from './utils'

export interface ModelResponse {
    prediction: string
    /** URL used to make the request to the model API */
    requestUrl: string
    /** Response headers received from the model API */
    responseHeaders: Record<string, string>
    /** Optional request headers sent to the model API */
    requestHeaders?: Record<string, string>
    /**
     * Optional request body sent to the model API
     * TODO: update to proper types from different adapters.
     */
    requestBody?: AutoeditsRequestBody | CodeCompletionsParams
    /**
     * Optional full response body received from the model API
     * This is propagated to the analytics logger for debugging purposes
     */
    responseBody?: any
}

export interface AutoeditsModelAdapter {
    getModelResponse(args: AutoeditModelOptions): Promise<ModelResponse>
}

/**
 * Represents the structure of a prompt for auto-edit functionality
 */
export type AutoeditsPrompt = {
    /**
     * Optional system message to provide context or instructions
     * This field is only valid for the chat models.
     * For the completions models, this is ignored by the adapters.
     */
    systemMessage?: PromptString
    /**
     * The user message containing the code to be rewritten.
     */
    userMessage: PromptString
}

export interface AutoeditModelOptions {
    url: string
    model: string
    prompt: AutoeditsPrompt
    codeToRewrite: string
    userId: string | null
    isChatModel: boolean
}
