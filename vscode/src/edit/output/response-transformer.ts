import { decode } from 'he'
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
        // Trim any leading or trailing spaces
        .replace(/^\s*\n/, '')

    // Strip the response of any remaining HTML entities such as &lt; and &gt;
    const decodedText = decode(strippedText)

    if (!isMessageInProgress) {
        const formattedToMatchLanguage = matchLanguage(decodedText, task)

        if (task.mode === 'insert') {
            // For insertions, we want to always ensure we include a new line at the end of the response
            // We do not attempt to match indentation, as we don't have any original text to compare to
            return formattedToMatchLanguage.endsWith('\n')
                ? formattedToMatchLanguage
                : formattedToMatchLanguage + '\n'
        }

        // LLMs have a tendency to complete the response with a final new line, but we don't want to
        // include this unless necessary, as we already trim the users' selection, and any additional whitespace will
        // hurt the readability of the diff.
        const trimmedReplacement =
            task.original.trimEnd().length === task.original.length
                ? formattedToMatchLanguage.trimEnd()
                : formattedToMatchLanguage
        // Attempt to match the indentation of the replacement with the original text
        return matchIndentation(trimmedReplacement, task.original)
    }

    return decodedText
}
