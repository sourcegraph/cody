import { type Message, type PromptString, charsToTokens } from '@sourcegraph/cody-shared'

export interface FireworksCompatibleRequestParams {
    stream: boolean
    model: string
    temperature: number
    max_tokens: number
    response_format: {
        type: string
    }
    prediction: {
        type: string
        content: string
    }
    rewrite_speculation?: boolean
    user?: string
}

export function getMaxOutputTokensForAutoedits(codeToRewrite: string): number {
    const MAX_NEW_GENERATED_TOKENS = 256
    const codeToRewriteTokens = charsToTokens(codeToRewrite.length)
    return codeToRewriteTokens + MAX_NEW_GENERATED_TOKENS
}

export function getOpenaiCompatibleChatPrompt(param: {
    systemMessage?: PromptString
    userMessage: PromptString
}): { role: string; content: PromptString }[] {
    const prompt = []
    if (param.systemMessage) {
        prompt.push({ role: 'system', content: param.systemMessage })
    }
    prompt.push({ role: 'user', content: param.userMessage })
    return prompt
}

export function getSourcegraphCompatibleChatPrompt(param: {
    systemMessage: PromptString | undefined
    userMessage: PromptString
}): Message[] {
    const prompt: Message[] = []
    if (param.systemMessage) {
        prompt.push({ speaker: 'system', text: param.systemMessage })
    }
    prompt.push({ speaker: 'human', text: param.userMessage })
    return prompt
}
