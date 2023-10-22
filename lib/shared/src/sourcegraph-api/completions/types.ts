export interface DoneEvent {
    type: 'done'
}

export interface CompletionEvent extends CompletionResponse {
    type: 'completion'
}

export interface ErrorEvent {
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
    logprobs?: Logprobs
}

export interface Logprobs {
    tokens: string[]
    token_logprobs: number[]
    top_logprobs: { [key: string]: number }[] | null
    text_offset: number[]
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
    logprobs?: number
}

export interface CompletionCallbacks {
    onChange: (text: string, logprobs?: Logprobs) => void
    /**
     * Only called when a stream successfully completes. If an error is
     * encountered, this is never called.
     */
    onComplete: () => void
    /**
     * Only called when a stream fails or encounteres an error. This should be
     * assumed to be a "complete" event, and no other callbacks will be called
     * afterwards.
     */
    onError: (message: string, statusCode?: number) => void
}
