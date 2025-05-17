import { decode } from 'he'
import type * as vscode from 'vscode'

import type { FixupTask } from '../../non-stop/FixupTask'
import {
    PROMPT_TOPICS,
    SMART_APPLY_CUSTOM_PROMPT_TOPICS,
    SMART_APPLY_MODEL_IDENTIFIERS,
} from '../prompt/constants'
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

const SMART_APPLY_MODEL_SET = new Set(Object.values(SMART_APPLY_MODEL_IDENTIFIERS))

/**
 * Checks if the task is using a smart apply custom model
 */
function taskUsesSmartApplyCustomModel(task: FixupTask): boolean {
    return SMART_APPLY_MODEL_SET.has(task.model)
}

/**
 * Strips the text of any unnecessary content.
 * This includes:
 * 1. Prompt topics, e.g. <CODE511>. These are used by the LLM to wrap the output code.
 * 2. Markdown code blocks, e.g. ```typescript. Most LLMs are trained to produce Markdown-suitable responses.
 */
function stripText(text: string, task: FixupTask): string {
    const strippedText = text
        // Strip specific XML tags referenced in the prompt, e.g. <CODE511>
        .replaceAll(PROMPT_TOPIC_REGEX, '')

    if (task.document.languageId === 'markdown') {
        // Return this text as is, we do not want to strip Markdown blocks as they may be valuable
        // in Markdown files
        return strippedText
    }

    // Strip Markdown syntax for code blocks, e.g. ```typescript.
    return strippedText.replaceAll(MARKDOWN_CODE_BLOCK_REGEX, block =>
        block.replace(MARKDOWN_CODE_BLOCK_START, '').replace(MARKDOWN_CODE_BLOCK_END, '')
    )
}

function extractSmartApplyCustomModelResponse(text: string, task: FixupTask): string {
    if (!taskUsesSmartApplyCustomModel(task)) {
        return text
    }

    const openingTag = `<${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}>`
    const closingTag = `</${SMART_APPLY_CUSTOM_PROMPT_TOPICS.FINAL_CODE}>`

    const startsWithTag = text.trimStart().startsWith(openingTag)
    const endsWithTag = text.trimEnd().endsWith(closingTag)

    if (!startsWithTag || !endsWithTag) {
        return text
    }

    // Only extract the code between the outermost tags
    const startIndex = text.indexOf(openingTag) + openingTag.length
    const endIndex = text.lastIndexOf(closingTag)
    return text.slice(startIndex, endIndex)
}

/**
 * Preserves or removes newlines at the start and end of the text based on the original text.
 * If the original text doesn't start/end with a newline, the corresponding newline in the updated text is removed.
 */
function trimLLMNewlines(text: string, original: string): string {
    let result = text

    // Handle starting newline
    if (result.match(/^\r?\n/) && !original.match(/^\r?\n/)) {
        result = result.replace(/^\r?\n/, '')
    }
    if (result.match(/\r?\n$/) && !original.match(/\r?\n$/)) {
        result = result.replace(/\r?\n$/, '')
    }

    return result
}

/**
 * Regular expression to detect the *few* entities we actually care about.
 * We purposefully limit the named-entity part to the common escaping
 * sequences that LLMs emit in source code:
 *   &lt;  &gt;  &amp;  &quot;  &apos;
 * Everything else (e.g. &nbsp;, &curren;, &copy;, …) is ignored so that we
 * don't accidentally alter code like "&current_value;".
 */
const POTENTIAL_HTML_ENTITY_REGEX = /&(?:(?:lt|gt|amp|quot|apos)|#\d+|#x[0-9a-fA-F]+);/

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
    // Skip processing for in-progress messages from smart apply custom models
    if (taskUsesSmartApplyCustomModel(task)) {
        if (isMessageInProgress || task.mode === 'insert') {
            return text
        }

        const updatedText = extractSmartApplyCustomModelResponse(text, task)

        // Preserve newlines only if they were in the original text
        return trimLLMNewlines(updatedText, task.original)
    }

    const strippedText = stripText(text, task)

    // Trim leading spaces
    // - For `add` insertions, the LLM will attempt to continue the code from the position of the cursor, we handle the `insertionPoint`
    //   but we should preserve new lines as they may be valuable for spacing
    // - For other edits, we already trim the selection to exclude padded whitespace, we only want the start of the incoming text
    const trimmedText =
        task.intent === 'add'
            ? strippedText.replace(LEADING_SPACES, '')
            : strippedText.replace(LEADING_SPACES_AND_NEW_LINES, '')

    // Decode HTML entities only if potential entities are detected.
    // this way we avoid decoding code that is not HTML.
    // For example, `int* current_ptr = &current_value;` should not be decoded.
    let decodedText = trimmedText
    if (POTENTIAL_HTML_ENTITY_REGEX.test(trimmedText)) {
        decodedText = decode(trimmedText)
    }

    if (!isMessageInProgress) {
        if (task.mode === 'insert') {
            // For insertions, we want to always ensure we include a new line at the end of the response
            // unless we have a selection range that is empty. This is the case when we have an `add`
            // intent such as a smart apply insert and there it doesn't make sense to include a new line.
            // We do not attempt to match indentation, as we don't have any original text to compare to
            return decodedText.endsWith('\n') || task.selectionRange.isEmpty
                ? decodedText
                : decodedText + '\n'
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
