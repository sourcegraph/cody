export interface OpenAIMessage {
    role: OpenAIMessageRole
    content: string
    images?: string[] | null
}

type OpenAIMessageRole = 'user' | 'assistant' | 'system'
