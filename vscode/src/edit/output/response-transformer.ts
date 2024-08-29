import { decode } from 'he'
import type * as vscode from 'vscode'
import type { FixupTask } from '../../non-stop/FixupTask'
import { PROMPT_TOPICS } from '../prompt/constants'
import { matchIndentation } from './match-indentation'
import { matchLanguage } from './match-language'

/**
 * Regular expression to match prompt topics.
 * Ignores specific numbers
 */
const PROMPT_TOPIC_REGEX = new RegExp(
    Object.values(PROMPT_TOPICS)
        .map(topic => `<\/?${topic}>`)
        .join('|')
        .replace(/\d+/g, '\\d+'),
    'g'
)

/**
 * Regular expressions to identify markdown code blocks, and then strip the start and end delimiters.
 * Important for compatibility with different chat models, due to most chat models being trained to output Markdown.
 */
const MARKDOWN_CODE_BLOCK_DELIMITER_START = '```(?:\\w+)?'
const MARKDOWN_CODE_BLOCK_DELIMITER_END = '```'
const MARKDOWN_CODE_BLOCK_START = new RegExp(`^${MARKDOWN_CODE_BLOCK_DELIMITER_START}`)
const MARKDOWN_CODE_BLOCK_END = new RegExp(`${MARKDOWN_CODE_BLOCK_DELIMITER_END}$`)
const MARKDOWN_CODE_BLOCK_REGEX = new RegExp(
    `${MARKDOWN_CODE_BLOCK_DELIMITER_START}\\s*([\\s\\S]*?)\\s*${MARKDOWN_CODE_BLOCK_DELIMITER_END}`,
    'g'
)

const LEADING_SPACES_AND_NEW_LINES = /^\s*\n/
const LEADING_SPACES = /^[ ]+/

/**
 * Given the LLM response for a FixupTask, transforms the response
 * to make it suitable to insert as code.
 * This is handling cases where the LLM response does not __only__ include code.
 */
export function responseTransformer(
    text: string,
    task: FixupTask,
    isMessageInProgress: boolean
): string {
    const strippedText = text
        // Strip specific XML tags referenced in the prompt, e.g. <CODE511>
        .replaceAll(PROMPT_TOPIC_REGEX, '')
        // Strip Markdown syntax for code blocks, e.g. ```typescript.
        .replaceAll(MARKDOWN_CODE_BLOCK_REGEX, block =>
            block.replace(MARKDOWN_CODE_BLOCK_START, '').replace(MARKDOWN_CODE_BLOCK_END, '')
        )

    // Trim leading spaces
    // - For `add` insertions, the LLM will attempt to continue the code from the position of the cursor, we handle the `insertionPoint`
    //   but we should preserve new lines as they may be valuable for spacing
    // - For other edits, we already trim the selection to exclude padded whitespace, we only want the start of the incoming text
    const trimmedText =
        task.intent === 'add'
            ? strippedText.replace(LEADING_SPACES, '')
            : strippedText.replace(LEADING_SPACES_AND_NEW_LINES, '')

    // Strip the response of any remaining HTML entities such as &lt; and &gt;
    const decodedText = decode(trimmedText)

    if (!isMessageInProgress) {
        if (task.mode === 'insert') {
            // For insertions, we want to always ensure we include a new line at the end of the response
            // We do not attempt to match indentation, as we don't have any original text to compare to
            return decodedText.endsWith('\n') ? decodedText : decodedText + '\n'
        }

        return formatToMatchOriginal(decodedText, task.original, task.fixupFile.uri)
    }

    return decodedText
}

function formatToMatchOriginal(incoming: string, original: string, uri: vscode.Uri): string {
    const formattedToMatchLanguage = matchLanguage(incoming, original, uri)

    // LLMs have a tendency to complete the response with a final new line, but we don't want to
    // include this unless necessary, as we already trim the users' selection, and any additional whitespace will
    // hurt the readability of the diff.
    const trimmedReplacement =
        original.trimEnd().length === original.length
            ? formattedToMatchLanguage.trimEnd()
            : formattedToMatchLanguage

    // Attempt to match the indentation of the replacement with the original text
    return matchIndentation(trimmedReplacement, original)
}
