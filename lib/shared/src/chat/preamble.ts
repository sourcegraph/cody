import type { Message } from '../sourcegraph-api'

export function getSimplePreamble(preInstruction?: string | undefined): Message[] {
    return [
        {
            speaker: 'human',
            text: `You are Cody, an AI coding assistant from Sourcegraph.${
                preInstruction ? ` ${preInstruction}` : ''
            }`,
        },
        {
            speaker: 'assistant',
            text: 'I am Cody, an AI coding assistant from Sourcegraph.',
        },
    ]
}
