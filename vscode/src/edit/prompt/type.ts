export interface LLMInteraction {
    prompt: string
    stopSequences?: string[]
    responseTopic?: string
    assistantText?: string
    assistantPrefix?: string
}

export interface GetLLMInteractionOptions {
    instruction: string
    precedingText: string
    selectedText: string
    followingText: string
    fileName: string
}

export interface EditLLMInteraction {
    getEdit(options: GetLLMInteractionOptions): LLMInteraction
    getDoc(options: GetLLMInteractionOptions): LLMInteraction
    getFix(options: GetLLMInteractionOptions): LLMInteraction
    getAdd(options: GetLLMInteractionOptions): LLMInteraction
}
