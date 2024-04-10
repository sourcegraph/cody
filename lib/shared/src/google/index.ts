export interface GeminiModelConfig {
    model: string
    key: string
    endpoint?: string
}

export interface GeminiCompletionResponse {
    candidates: {
        content: {
            parts: { text: string }[]
            role: string
        }
        finishReason: string
        index: number
        safetyRatings: {
            category: string
            probability: string
        }[]
    }[]
}
