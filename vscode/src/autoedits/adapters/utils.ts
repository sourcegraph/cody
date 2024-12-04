import type { Message, PromptString } from '@sourcegraph/cody-shared'

export function getOpenaiCompatibleChatPrompt(
    systemMessage: PromptString | undefined,
    userMessage: PromptString
): { role: string; content: PromptString }[] {
    const prompt = []
    if (systemMessage) {
        prompt.push({ role: 'system', content: systemMessage })
    }
    prompt.push({ role: 'user', content: userMessage })
    return prompt
}

export function getSourcegraphCompatibleChatPrompt(
    systemMessage: PromptString | undefined,
    userMessage: PromptString
): Message[] {
    const prompt: Message[] = []
    if (systemMessage) {
        prompt.push({ speaker: 'system', text: systemMessage })
    }
    prompt.push({ speaker: 'human', text: userMessage })
    return prompt
}
