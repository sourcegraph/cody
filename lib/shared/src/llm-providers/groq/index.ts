/**
 * Represents the response from the Groq Chat Completion API.
 *
 * @property {string} model - The model used for the completion.
 * @property {GroqCompletionsError} [error] - Any error that occurred during the completion.
 * @property {Object[]} [choices] - The completion choices returned by the API.
 * @property {string} [choices[].finish_reason] - The reason the completion finished.
 * @property {string|null} [choices[].logprobs] - The log probabilities of the tokens in the completion.
 * @property {GroqChatMessage} [choices[].message] - The completion message.
 * @property {boolean} done - Indicates whether the completion is done.
 * @property {GroqCompletionsResponseUsage} [usage] - Usage information for the completion.
 * @property {string} [id] - The ID of the completion.
 * @property {number} [created] - The timestamp when the completion was created.
 */
export interface GroqCompletionsStreamResponse {
    model: string
    error?: GroqCompletionsError
    choices?: {
        delta?: {
            model?: string
            finish_reason?: string
            logprobs?: string | null
            content?: string
        }
    }[]
    done: boolean
    usage?: GroqCompletionsResponseUsage
    id?: string
    created?: number
}

interface GroqCompletionsError {
    message: string
    type: string
}

interface GroqCompletionsResponseUsage {
    prompt_tokens: number
    prompt_time: number
    completion_tokens: number
    completion_time: number
    total_tokens: number
    total_time: number
}
