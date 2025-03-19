import type { URI } from 'vscode-uri'
import type { SerializedChatMessage } from '../../chat/transcript/messages'
import type { PromptString } from '../../prompt/prompt-string'

interface DoneEvent {
    type: 'done'
}

interface CompletionEvent extends CompletionResponse {
    type: 'completion'
    content?: CompletionContentData[] | undefined
}

export type CompletionContentData = ToolContentParts | TextContentPart

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
    | ToolContentParts

export interface TextContentPart {
    type: 'text'
    text: string | undefined | null
}

// @added(Versions.V5_8)
export interface ImageContentPart {
    type: 'image_url'
    image_url: { url: string }
}

export type ToolContentParts = ToolCallContentPart | ToolResultContentPart

export interface ToolCallContentPart {
    type: 'tool_call'
    tool_call: {
        id: string
        name: string
        arguments: string
    }
    tool_result?: ToolResultContentPart
}

export interface ToolResultContentPart {
    type: 'tool_result'
    tool_result: {
        id: string
        content: string
    }
    output?: UIToolOutput
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
    tools?: ToolCallContentPart[]
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

export type UIToolOutput =
    | UIToolOutputBase
    | UISearchResults
    | UITerminalToolOutput
    | UIFileDiff
    | UIFileView

export enum UIToolStatus {
    Pending = 'pending',
    Done = 'done',
    Error = 'error',
    Canceled = 'canceled',
    Idle = 'idle',
    Info = 'info',
}

/**
 * Main container for all tool output types
 */
interface UIToolOutputBase {
    type: 'search-result' | 'file-diff' | 'terminal-output' | 'file-view' | 'status'
    status?: UIToolStatus | undefined | null
    title?: string | undefined | null
    content?: string | undefined | null
    duration?: number | undefined | null
    query?: string | undefined | null
}

// Basic file content display
export interface UIFileBase {
    fileName: string
    uri: URI
    content?: string | undefined | null
}

// Individual search result item
export interface UIFileView extends UIToolOutputBase {
    type: 'file-view'
    file: UIFileBase
}

export interface UISearchResults extends UIToolOutputBase {
    type: 'search-result'
    items: UISearchItem[]
}

// Individual search result item
interface UISearchItem extends UIFileBase {
    lineNumber?: string
    preview?: string
    type: 'file' | 'folder' | 'code'
}

// File diff display
export interface UIFileDiff extends UIToolOutputBase {
    type: 'file-diff'
    total: UIChangeStats
    changes: UIDiffLine[]
    uri: URI
}

// Change statistics summary
interface UIChangeStats {
    added: number
    removed: number
    modified: number
}

// Individual diff line
export interface UIDiffLine {
    type: 'added' | 'removed' | 'unchanged'
    content: string
    lineNumber: number
}

export interface UITerminalToolOutput extends UIToolOutputBase {
    type: 'terminal-output'
    output: UITerminalLine[]
}

// Terminal output types
export enum UITerminalOutputType {
    Input = 'input',
    Output = 'output',
    Error = 'error',
    Warning = 'warning',
    Success = 'success',
}

// Individual terminal line
export interface UITerminalLine {
    content: string
    type?: UITerminalOutputType | undefined | null
}
