import { type PromptString, ps } from '../prompt/prompt-string'
import type { Message } from '../sourcegraph-api'

export function getSimplePreamble(
    model: string | undefined,
    apiVersion: number,
    preInstruction?: PromptString
): Message[] {
    const intro = ps`You are Cody, an AI coding assistant from Sourcegraph. ${
        preInstruction ?? ps``
    }`.trim()

    // API Version 1 onward support system prompts, however only enable it for
    // Claude 3 models for now
    if (apiVersion >= 1 && model?.includes('claude-3')) {
        return [
            {
                speaker: 'system',
                text: intro,
            },
        ]
    }

    return [
        {
            speaker: 'human',
            text: intro,
        },
        {
            speaker: 'assistant',
            text: ps`I am Cody, an AI coding assistant from Sourcegraph.`,
        },
    ]
}
