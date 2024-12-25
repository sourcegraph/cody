import type { PromptString } from '@sourcegraph/cody-shared'

export interface AutoeditsModelAdapter {
    getModelResponse(args: AutoeditModelOptions): Promise<string>
}

/**
 * Represents the structure of a prompt for auto-edits functionality
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
