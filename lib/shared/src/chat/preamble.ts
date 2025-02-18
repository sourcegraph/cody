import type { ChatModel, EditModel } from '../models/types'
import { type PromptString, ps } from '../prompt/prompt-string'
import type { Message } from '../sourcegraph-api'

const DEFAULT_PREAMBLE = ps`You are Cody, an AI coding assistant from Sourcegraph.`

/**
 * For chat, we add an additional preamble to encourage the model to
 * produce code blocks that we can associate executable commands or content with existing file paths.
 * We want to read these file paths to support applying code directly to files from chat for Smart Apply.
 */
const SMART_APPLY_PREAMBLE = ps`If your answer contains fenced code blocks in Markdown, include the relevant full file path in the code block tag using this structure: \`\`\`$LANGUAGE:$FILEPATH regex=pattern\n\`\`\`
The regex pattern must precisely match the code you enclosed in each code block. The code block content will replace the matched code. For functions, always use the pattern '(functionName[\s\S]*$)' to capture from the function declaration to end of file, or '.*' to capture the entire file.
When showing code context, put code outside the replacement area in separate code blocks.
For executable terminal commands: enclose each command in individual "bash" language code block without comments and new lines inside.`

const CHAT_PREAMBLE = DEFAULT_PREAMBLE.concat(SMART_APPLY_PREAMBLE)

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
