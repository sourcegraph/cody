import type { OllamaGenerateParameters, PromptString } from '../..'
import type { OpenAIMessage } from '../types'

export const OLLAMA_DEFAULT_URL = 'http://localhost:11434'

export { createOllamaClient } from './completions-client'
export { ollamaChatClient } from './chat-client'

/**
 * By default, Ollama uses a context window size of 2048 tokens.
 *
 * @see https://github.com/ollama/ollama/blob/main/docs/faq.md#how-can-i-specify-the-context-window-size
 */
export const OLLAMA_DEFAULT_CONTEXT_WINDOW = 2048

/**
 * @see https://sourcegraph.com/github.com/jmorganca/ollama/-/blob/api/types.go?L35
 */
export interface OllamaGenerateParams {
    model: string
    template: string
    prompt: PromptString
    options?: OllamaGenerateParameters
}

/**
 * @see https://sourcegraph.com/github.com/jmorganca/ollama/-/blob/api/types.go?L50
 */
export interface OllamaChatParams {
    model: string
    messages: OllamaChatMessage[]
    format?: string
    stream?: boolean
    //  controls how long the model will stay loaded into memory following the request (default: 5m)
    keep_alive?: string

    options?: OllamaGenerateParameters
}

interface OllamaChatMessage {
    role: string
    content: PromptString
    images?: string[]
}

/**
 * @see https://sourcegraph.com/github.com/jmorganca/ollama/-/blob/api/types.go?L88
 */
export interface OllamaGenerateResponse {
    model: string
    response?: string
    done: boolean
    context?: number[]
    total_duration?: number
    load_duration?: number
    prompt_eval_count?: number
    prompt_eval_duration?: number
    eval_count?: number
    eval_duration?: number
    sample_count?: number
    sample_duration?: number
    message?: OpenAIMessage
}

export interface OllamaGenerateErrorResponse {
    error?: string
}
