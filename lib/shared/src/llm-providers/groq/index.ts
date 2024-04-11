import type { GroqCompletionOptions } from '../../configuration'
import type { OpenAIMessage } from '../types'

/**
 * Represents the parameters for a Groq chat completion request.
 *
 * @property {string} model - The model used for the completion.
 * @property {GroqChatMessage[]} messages - The messages in the completion request.
 *
 * The following parameters are not supported by Groq and will result in 400 errors:
 * {number} [logprobs] - The number of log probabilities to return for each token.
 * {number} [logit_bias] - The logit bias for the completion.
 * {number} [top_logprobs] - The number of top log probabilities to return for each token.
 */
export interface GroqCompletionsParameters extends GroqCompletionOptions {
    model: string
    messages: GroqChatMessage[]
}

/**
 * Represents a message in a Groq chat completion request.
 *
 * @property {string} [name] - An optional name to disambiguate messages from different users with the same role.
 * @property {number} [seed] - Seed used for sampling. Groq attempts to return the same response to the same request with an identical seed.
 */
interface GroqChatMessage extends OpenAIMessage {
    name?: string
    seed?: number
}

/**
 * Default context window sizes for various Groq models.
 *
 * @see https://console.groq.com/docs/models
 */
export const GROQ_DEFAULT_CONTEXT_WINDOW = {
    mixtral: 32768,
    llama2: 4096,
    gemma: 8192,
}

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
