import type { SerializedChatMessage } from '../../chat/transcript/messages'
import type { PromptString } from '../../prompt/prompt-string'

interface DoneEvent {
    type: 'done'
}

interface CompletionEvent extends CompletionResponse {
    type: 'completion'
    content?: CompletionContentData[] | undefined
}

export type CompletionContentData = ToolContentPart | TextContentPart

// Tool calls returned by the LLM
export interface CompletionFunctionCallsData {
    type: 'function'
    id?: string
    function: {
        name: string
        arguments: string
    }
}

// Tool function that can be called by the LLM
export interface FunctionTool {
    type: 'function'
    function: {
        name: string
        description?: string
        parameters?: {
            type: 'object'
            properties?: unknown | null
            [k: string]: unknown
        }
    }
}

interface ErrorEvent {
    type: 'error'
    error: string
}

export type Event = DoneEvent | CompletionEvent | ErrorEvent

export interface Message {
    // Note: The unified API only supports one system message passed as the first message
    speaker: 'human' | 'assistant' | 'system'
    // content used to be text, but starting from api-version 7, we require Cody clients to
    // stop using text and send content to instead to respect the official API contract and
    // mirrors what OpenAI and Anthropic expect
    text?: PromptString
    cacheEnabled?: boolean | null
    content?: MessagePart[] | undefined | null
}

// content: string | Array<TextPart | ImagePart | FilePart>
export type MessagePart =
    | TextContentPart // natively supported by LLM
    | { type: 'context_file'; uri: string; content?: string } // Cody extension
    | { type: 'context_repo'; repoId: string } // Cody extension
    | { type: 'image_url'; image_url: { url: string } } // natively supported by LLM
    | ToolContentPart

export interface TextContentPart {
    type: 'text'
    text: string | undefined | null
}

// @added(Versions.V5_8)
export interface ImageContentPart {
    type: 'image_url'
    image_url: { url: string }
}

export interface ToolContentPart extends CompletionFunctionCallsData {
    id: string
    result?: string
    status: string
}

export interface CompletionUsage {
    completion_tokens: number | null
    prompt_tokens: number | null
    total_tokens: number | null
    prompt_tokens_details?: PromptTokensDetails | null
}

export interface PromptTokensDetails {
    cached_tokens?: number | null
    cache_read_input_tokens?: number | null
}

export interface CompletionResponse {
    completion: string
    thinking?: string
    stopReason?: string
    tools?: ToolContentPart[]
}

export interface CompletionParameters {
    fast?: boolean
    messages: Message[]
    maxTokensToSample: number
    temperature?: number
    stopSequences?: string[]
    topK?: number
    topP?: number
    model?: string
    stream?: boolean
    // Configuration for a Predicted Output, which can greatly improve response
    // times when large parts of the model response are known ahead of time.
    // https://platform.openai.com/docs/guides/latency-optimization#use-predicted-outputs
    // https://platform.openai.com/docs/api-reference/chat/create#chat-create-prediction
    prediction?: {
        type: 'content'
        content: string
    }
    // Rewrite and adaptive speculation is used by fireworks which improves performance for sparse rewrite tasks.
    // https://docs.fireworks.ai/guides/predicted-outputs#using-predicted-outputs
    rewriteSpeculation?: boolean
    adaptiveSpeculation?: boolean
}

export interface SerializedCompletionParameters extends Omit<CompletionParameters, 'messages'> {
    messages: SerializedChatMessage[]
}

export interface CompletionCallbacks {
    onChange: (text: string, content?: CompletionContentData[]) => void
    onComplete: () => void
    onError: (error: Error, statusCode?: number) => void
}

/**
 * Values for the completion generator that represent the progress of a streaming completion.
 *
 * - `change`: Called when new text is received. The `text` is the full text, not just the new text
 *   since the last `change` value.
 * - `complete`: Only called when a stream successfully completes. If an error is encountered, this
 *   is never called.
 * - `error`: Only called when a stream fails or encounters an error. This should be assumed to be
 *   a "complete" event, and no other callbacks will be called afterwards.
 */
export type CompletionGeneratorValue =
    | { type: 'change'; text: string; content?: CompletionContentData[] }
    | { type: 'complete' }
    | { type: 'error'; error: Error; statusCode?: number }
