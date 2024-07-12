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

export interface GeminiChatMessage {
    role: string
    parts: { text: string }[]
}
