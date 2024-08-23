import { type PromptString, ps, psDedent } from '../prompt/prompt-string'
import type { Message } from '../sourcegraph-api'

const DEFAULT_PREAMBLE = ps`You are Cody, an AI coding assistant from Sourcegraph.`

/**
 * For chat, we add an additional preamble to encourage the model to
 * produce code blocks that we can associate with existing file paths.
 * We want to read these file paths to support applying code directly to files from chat.
 */
const SMART_APPLY_PREAMBLE = ps`If your answer contains fenced code blocks in Markdown, include the full file path in the code block tag using this structure: \`\`\`$LANGUAGE:$FILEPATH\n\`\`\`.`
const CHAT_PREAMBLE = DEFAULT_PREAMBLE.join(SMART_APPLY_PREAMBLE)
    ${DEFAULT_PREAMBLE}

    Additional rules:
    - When generating fenced code blocks in Markdown, ensure you include the full file path in the tag. The structure should be \`\`\`language:path/to/file\n\`\`\`.
`.trim()

export function getSimplePreamble(
    model: string | undefined,
    apiVersion: number,
    type: 'Chat' | 'Default',
    preInstruction?: PromptString
): Message[] {
    const preamble = type === 'Chat' ? CHAT_PREAMBLE : DEFAULT_PREAMBLE
    const intro = ps`${preamble}\n\n${preInstruction.toString() ?? ''}`.trim()

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
