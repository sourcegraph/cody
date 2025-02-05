import type { ChatModel, EditModel } from '../models/types'
import { type PromptString, ps } from '../prompt/prompt-string'
import { SMART_APPLY_SYSTEM_PROMPT } from '../prompt/smart-apply'
import type { Message } from '../sourcegraph-api'

const DEFAULT_PREAMBLE = ps`You are Cody, an AI coding assistant from Sourcegraph.`

const CHAT_PREAMBLE = DEFAULT_PREAMBLE.concat(SMART_APPLY_SYSTEM_PROMPT)

export function getSimplePreamble(
    model: ChatModel | EditModel | undefined,
    apiVersion: number,
    type: 'Chat' | 'Default',
    preInstruction?: PromptString
): Message[] {
    const preamble = type === 'Chat' ? CHAT_PREAMBLE : DEFAULT_PREAMBLE
    const intro = ps`${preamble}\n\n${preInstruction ?? ''}`.trim()

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
