import { type Message, type PromptString, charsToTokens } from '@sourcegraph/cody-shared'

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

export async function getModelResponse(
    url: string,
    body: string,
    apiKey: string,
    customHeaders: Record<string, string> = {}
): Promise<any> {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            ...customHeaders,
        },
        body: body,
    })
    if (response.status !== 200) {
        const errorText = await response.text()
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`)
    }
    const data = await response.json()
    return data
}
