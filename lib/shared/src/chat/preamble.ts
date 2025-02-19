import type { ChatModel, EditModel } from '../models/types'
import { type PromptString, ps } from '../prompt/prompt-string'
import type { Message } from '../sourcegraph-api'

const DEFAULT_PREAMBLE = ps`You are Cody, an AI coding assistant from Sourcegraph.`

export function getDefaultSystemPrompt(): PromptString {
    return DEFAULT_PREAMBLE
}

/**
 * For chat, we add an additional preamble to encourage the model to
 * produce code blocks that we can associate executable commands or content with existing file paths.
 * We want to read these file paths to support applying code directly to files from chat for Smart Apply.
 */
const SMART_APPLY_PREAMBLE = ps`If your answer contains fenced code blocks in Markdown, include the relevant full file path in the code block tag using this structure: \`\`\`$LANGUAGE:$FILEPATH\`\`\`
For executable terminal commands: enclose each command in individual "bash" language code block without comments and new lines inside.`

const CHAT_PREAMBLE = DEFAULT_PREAMBLE.concat(SMART_APPLY_PREAMBLE)

export function getChatPreamble(): PromptString {
    return CHAT_PREAMBLE
}

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
