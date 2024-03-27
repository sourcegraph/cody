import { PROMPT_TOPICS } from '../prompt/constants'

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

// It also removes all spaces before a new line to keep the indentations
export function responseTransformer(text: string): string {
    const strippedText = text
        // Strip specific XML tags referenced in the prompt, e.g. <CODE511>
        .replaceAll(PROMPT_TOPIC_REGEX, '')
        // Strip Markdown syntax for code blocks, e.g. ```typescript.
        .replaceAll(MARKDOWN_CODE_BLOCK_REGEX, block =>
            block.replace(MARKDOWN_CODE_BLOCK_START, '').replace(MARKDOWN_CODE_BLOCK_END, '')
        )
        // Trim any leading or trailing spaces
        .replace(/^\s*\n/, '')

    return strippedText
}
