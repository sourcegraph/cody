interface DoneEvent {
    type: 'done'
}

interface CompletionEvent extends CompletionResponse {
    type: 'completion'
}

interface ErrorEvent {
    type: 'error'
    error: string
}

export type Event = DoneEvent | CompletionEvent | ErrorEvent

export interface Message {
    speaker: 'human' | 'assistant'
    text?: string
}

export interface CompletionResponse {
    completion: string
    stopReason: string
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
}

export interface CompletionCallbacks {
    onChange: (text: string) => void
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
    | { type: 'change'; text: string }
    | { type: 'complete' }
    | { type: 'error'; error: Error; statusCode?: number }
