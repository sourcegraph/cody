export interface Completion {
    prefix: string
    content: string
    stopReason?: string
}

export interface PostProcessCompletionContext {
    prefix: string
    suffix: string
    languageId: string
}
