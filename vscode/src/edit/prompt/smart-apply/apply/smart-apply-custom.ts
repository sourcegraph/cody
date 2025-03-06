import * as vscode from 'vscode'

import {
    BotResponseMultiplexer,
    type Message,
    PromptString,
    charsToTokens,
    ps,
    psDedent,
    tokensToChars,
} from '@sourcegraph/cody-shared'
import {
    getPrefixWithCharLimit,
    getSuffixWithCharLimit,
} from '../../../../completions/get-current-doc-context'
import { lines } from '../../../../completions/text-processing'
import { SMART_APPLY_CUSTOM_PROMPT_TOPICS } from '../../../../edit/prompt/constants'
import type {
    BuildInteractionOptions,
    BuiltInteraction,
    EditPromptBuilder,
} from '../../../../edit/prompt/type'
import { getInstructionPromptWithCharLimit } from '../utils'

// https://huggingface.co/Qwen/Qwen2.5-Coder-32B-Instruct
const CUSTOM_MODEL_DEFAULTS = {
    STOP_SEQUENCES: ['<|im_start|>', '<|im_end|>', '<|endoftext|>'],
    MAX_INSTRUCTION_TOKENS: 500,
}

function getTagsExplanationPrompt(): PromptString {
    return ps`- Provided XML tags define:
<${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FULL_FILE_CODE}>: Full file source containing <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.CODE_TO_UPDATE}>.
<${SMART_APPLY_CUSTOM_PROMPT_TOPICS.CODE_TO_UPDATE_LOCATION_MARKER_IN_FULL_FILE_CODE}>: Marker for <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.CODE_TO_UPDATE}> within <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FULL_FILE_CODE}>.
<${SMART_APPLY_CUSTOM_PROMPT_TOPICS.CODE_TO_UPDATE}>: Code snippet to update per <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.TARGET_CHANGES}>.
<${SMART_APPLY_CUSTOM_PROMPT_TOPICS.USER_QUERY}>: User query that generated <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.TARGET_CHANGES}>.
<${SMART_APPLY_CUSTOM_PROMPT_TOPICS.TARGET_CHANGES}>: Changes to apply to <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.CODE_TO_UPDATE}>.
<${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}>: Final updated code snippet.`
}

function getGuidelinesPrompt(): PromptString {
    return ps`Follow these guidelines:
- Apply only changes from <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.TARGET_CHANGES}>.
- Do not add or remove code in <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.CODE_TO_UPDATE}> beyond what <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.TARGET_CHANGES}> specifies.
- Rewrite the entire <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.CODE_TO_UPDATE}> without skipping any lines.
- Retain all comments, blank lines, and unmodified code in <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.CODE_TO_UPDATE}>.
- Do not omit any required changes.
- Exclude ellipsis or placeholder comments (e.g. // ...existing code) from <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}>.
- Update only the code in <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.CODE_TO_UPDATE}>, not the entire <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FULL_FILE_CODE}> or code outside the <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.CODE_TO_UPDATE_LOCATION_MARKER_IN_FULL_FILE_CODE}> marker.
- Provide no additional commentary—only the generated code.
- Ensure that the updated <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}> retains the original indentation, whitespace, comments, and unrelated code, and output it without markdown formatting or extra commentary.`
}

function getSystemPrompt(): PromptString {
    return psDedent`You are an AI assistant specialized in updating code snippets. You will update the code in the <${
        SMART_APPLY_CUSTOM_PROMPT_TOPICS.CODE_TO_UPDATE
    }> tag based solely on the modifications specified in the <${
        SMART_APPLY_CUSTOM_PROMPT_TOPICS.TARGET_CHANGES
    }> tag.
${getTagsExplanationPrompt()}
Review the full file code (<${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FULL_FILE_CODE}>), the target snippet (<${
        SMART_APPLY_CUSTOM_PROMPT_TOPICS.CODE_TO_UPDATE
    }>), and the changes (<${SMART_APPLY_CUSTOM_PROMPT_TOPICS.TARGET_CHANGES}>) to plan your update.

${getGuidelinesPrompt()}`
}

function getUserPrompt(
    filePath: PromptString,
    chatQuery: PromptString,
    replacementCodeBlock: PromptString,
    selection: PromptString,
    precedingText: PromptString,
    followingText: PromptString
): PromptString {
    return ps`The user query enclosed in the <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.USER_QUERY}></${SMART_APPLY_CUSTOM_PROMPT_TOPICS.USER_QUERY}> tag is used to produce the updated code snippet enclosed in the <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.TARGET_CHANGES}></${SMART_APPLY_CUSTOM_PROMPT_TOPICS.TARGET_CHANGES}> tag.
You need to apply the changes suggested in the <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.TARGET_CHANGES}> tag to the <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.CODE_TO_UPDATE}> tag.

Here is the user query used to generated the <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.TARGET_CHANGES}>:
<${SMART_APPLY_CUSTOM_PROMPT_TOPICS.USER_QUERY}>${chatQuery}</${SMART_APPLY_CUSTOM_PROMPT_TOPICS.USER_QUERY}>

Here is the full file code. The position of the code between the <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.CODE_TO_UPDATE}> tag is marked with the <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.CODE_TO_UPDATE_LOCATION_MARKER_IN_FULL_FILE_CODE}> tag:
(\`${filePath}\`)
<${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FULL_FILE_CODE}>${precedingText}
${SMART_APPLY_CUSTOM_PROMPT_TOPICS.CODE_TO_UPDATE_LOCATION_MARKER_IN_FULL_FILE_CODE}
${followingText}</${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FULL_FILE_CODE}>

Here is the code which you need to update:
<${SMART_APPLY_CUSTOM_PROMPT_TOPICS.CODE_TO_UPDATE}>${selection}</${SMART_APPLY_CUSTOM_PROMPT_TOPICS.CODE_TO_UPDATE}>

Here is the code changes which you need to apply to the code enclosed in the <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.CODE_TO_UPDATE}> tag:
<${SMART_APPLY_CUSTOM_PROMPT_TOPICS.TARGET_CHANGES}>${replacementCodeBlock}</${SMART_APPLY_CUSTOM_PROMPT_TOPICS.TARGET_CHANGES}>

Please apply all the code changes suggested in the <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.TARGET_CHANGES}></${SMART_APPLY_CUSTOM_PROMPT_TOPICS.TARGET_CHANGES}> into the <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.CODE_TO_UPDATE}></${SMART_APPLY_CUSTOM_PROMPT_TOPICS.CODE_TO_UPDATE}> code to produce the updated code enclosed in the <${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}></${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}> tag.`
}

export function getPrefixAndSuffixWithCharLimit(
    document: vscode.TextDocument,
    prefixRange: vscode.Range,
    suffixRange: vscode.Range,
    tokenLimit: number
): {
    precedingText: PromptString
    followingText: PromptString
} {
    const charLimit = tokensToChars(tokenLimit)
    const maxChars = Math.floor(charLimit / 2)

    const prefixWithCharLimit = getPrefixWithCharLimit(lines(document.getText(prefixRange)), maxChars)
    const suffixWithCharLimit = getSuffixWithCharLimit(lines(document.getText(suffixRange)), maxChars)

    const prefixStartLine = Math.max(0, prefixRange.end.line - lines(prefixWithCharLimit).length)
    const suffixEndLine = Math.min(
        document.lineCount - 1,
        suffixRange.start.line + lines(suffixWithCharLimit).length
    )

    const adjustedPrefixRange = new vscode.Range(
        prefixStartLine,
        0,
        prefixRange.end.line,
        prefixRange.end.character
    )
    const adjustedSuffixRange = new vscode.Range(
        suffixRange.start.line,
        suffixRange.start.character,
        suffixEndLine,
        document.lineAt(suffixEndLine).text.length
    )

    return {
        precedingText: PromptString.fromDocumentText(document, adjustedPrefixRange),
        followingText: PromptString.fromDocumentText(document, adjustedSuffixRange),
    }
}

export async function getCurrentTokenCount(promptList: PromptString[]): Promise<number> {
    let total = 0
    for (const prompt of promptList) {
        total += charsToTokens(prompt.length)
    }
    return total
}

export class SmartApplyCustomEditPromptBuilder implements EditPromptBuilder {
    async buildInteraction({ task, contextWindow }: BuildInteractionOptions): Promise<BuiltInteraction> {
        if (task.intent !== 'smartApply') {
            throw new Error(
                'SmartApplyCustomEditPromptBuilder: Smart apply custom prompt builder should only be used for smart apply tasks'
            )
        }
        if (task.smartApplyMetadata === undefined) {
            throw new Error(
                'SmartApplyCustomEditPromptBuilder: Smart apply metadata is required for smart apply custom prompt builder'
            )
        }

        const { chatQuery, replacementCodeBlock } = task.smartApplyMetadata

        const document = await vscode.workspace.openTextDocument(task.fixupFile.uri)
        const selectedText = PromptString.fromDocumentText(document, task.selectionRange)
        const systemPrompt = getSystemPrompt()

        let currentTokenCount = await getCurrentTokenCount([
            systemPrompt,
            selectedText,
            replacementCodeBlock,
        ])

        const chatQueryWithTokenLimit = getInstructionPromptWithCharLimit(
            chatQuery,
            Math.max(
                0,
                Math.min(CUSTOM_MODEL_DEFAULTS.MAX_INSTRUCTION_TOKENS, contextWindow - currentTokenCount)
            )
        )
        currentTokenCount += charsToTokens(chatQueryWithTokenLimit.length)

        const prefixRange = new vscode.Range(new vscode.Position(0, 0), task.selectionRange.start)
        const suffixRange = new vscode.Range(
            task.selectionRange.end,
            new vscode.Position(document.lineCount, 0)
        )

        const { precedingText, followingText } = getPrefixAndSuffixWithCharLimit(
            document,
            prefixRange,
            suffixRange,
            Math.max(0, contextWindow - currentTokenCount)
        )

        const userPrompt = getUserPrompt(
            PromptString.fromDisplayPath(task.fixupFile.uri),
            chatQueryWithTokenLimit,
            replacementCodeBlock,
            selectedText,
            precedingText,
            followingText
        )

        const messages: Message[] = [
            { speaker: 'assistant', text: systemPrompt },
            { speaker: 'human', text: userPrompt },
        ]

        return {
            messages,
            stopSequences: CUSTOM_MODEL_DEFAULTS.STOP_SEQUENCES,
            responseTopic: BotResponseMultiplexer.DEFAULT_TOPIC,
        }
    }
}
