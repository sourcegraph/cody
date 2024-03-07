import { supportsFastPath } from '../models/utils'
import type { Message } from '../sourcegraph-api'

export function getSimplePreamble(model: string, preInstruction?: string | undefined): Message[] {
    const intro = `You are Cody, an AI coding assistant from Sourcegraph.${
        preInstruction ? ` ${preInstruction}` : ''
    }`

    if (supportsFastPath(model)) {
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
