import type { Message } from '../sourcegraph-api'

export function getSimplePreamble(apiVersion: number, preInstruction?: string | undefined): Message[] {
    const intro = `You are Cody, an AI coding assistant from Sourcegraph.${
        preInstruction ? ` ${preInstruction}` : ''
    }`

    // API Version 1 onward support system prompts
    if (apiVersion >= 1) {
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
            text: 'I am Cody, an AI coding assistant from Sourcegraph.',
        },
    ]
}
