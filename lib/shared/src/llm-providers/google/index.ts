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

export interface ImageData {
    data: string
    mimeType: MimeType
}

export type MimeType = 'image/jpeg' | 'image/png' | 'image/webp'
export interface InlineDataPart {
    inline_data: {
        mime_type: MimeType
        data: string
    }
}
export interface Part {
    text: string
}

export interface GeminiChatMessage {
    role: string
    parts: (Part | InlineDataPart)[]
}
