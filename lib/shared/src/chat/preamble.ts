import { supportsUnifiedApi } from '../models/utils'
import type { Message } from '../sourcegraph-api'

export function getSimplePreamble(model: string, preInstruction?: string | undefined): Message[] {
    if (supportsUnifiedApi(model)) {
        return [
            {
                speaker: 'system',
                text: `You are Cody, an AI coding assistant from Sourcegraph.${
                    preInstruction ? ` ${preInstruction}` : ''
                }`,
            },
        ]
    }

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
