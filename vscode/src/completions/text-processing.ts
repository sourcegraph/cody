import { getLanguageConfig } from './language'
import { isAlmostTheSameString } from './utils/string-comparator'
import { getEditorTabSize, shouldIncludeClosingLine } from './utils/text-utils'

export const OPENING_CODE_TAG = '<CODE5711>'
export const CLOSING_CODE_TAG = '</CODE5711>'

/**
 * This extracts the generated code from the response from Anthropic. The generated code is
 * bookended by <CODE5711></CODE5711> tags (the '5711' ensures the tags are not interpreted as HTML
 * tags and this seems to yield better results).
 *
 * Any trailing whitespace is trimmed, but leading whitespace is preserved.
 * Trailing whitespace seems irrelevant to the user experience.
 * Leading whitespace is important, as leading newlines and indentation are relevant.
 *
 * @param completion The raw completion result received from Anthropic
 * @returns the extracted code block
 */
export function extractFromCodeBlock(completion: string): string {
    if (completion.includes(OPENING_CODE_TAG)) {
        // TODO(valery): use logger here instead.
        // console.error('invalid code completion response, should not contain opening tag <CODE5711>')
        return ''
    }

    const [result] = completion.split(CLOSING_CODE_TAG)

    return result.trimEnd()
}

const INDENTATION_REGEX = /^[\t ]*/
/**
 * Counts space or tabs in the beginning of a line.
 *
 * Since Cody can sometimes respond in a mix of tab and spaces, this function
 * normalizes the whitespace first using the currently enabled tabSize option.
 */
export function indentation(line: string): number {
    const tabSize = getEditorTabSize()

    const regex = line.match(INDENTATION_REGEX)
    if (regex) {
        const whitespace = regex[0]
        return [...whitespace].reduce((p, c) => p + (c === '\t' ? tabSize : 1), 0)
    }

    return 0
}

const BAD_COMPLETION_START = /^(\p{Emoji_Presentation}|\u{200B}|\+ |- |\. )+(\s)+/u
export function fixBadCompletionStart(completion: string): string {
    if (BAD_COMPLETION_START.test(completion)) {
        return completion.replace(BAD_COMPLETION_START, '')
    }

    return completion
}

/**
 * A TrimmedString represents a string that has had its lead and rear whitespace trimmed.
 * This to manage and track whitespace during pre- and post-processing of inputs to
 * the Claude API, which is highly sensitive to whitespace and performs better when there
 * is no trailing whitespace in its input.
 */
export interface TrimmedString {
    trimmed: string
    leadSpace: string
    rearSpace: string
}

/**
 * PrefixComponents represent the different components of the "prefix", the section of the
 * current file preceding the cursor. The prompting strategy for Claude follows this pattern:
 *
 * Human: Complete this code: <CODE5711>const foo = 'bar'
 * const bar = 'blah'</CODE5711>
 *
 * Assistant: Here is the completion: <CODE5711>const baz = 'buzz'
 * return</CODE5711>
 *
 * Note that we "put words into Claude's mouth" to ensure the completion starts from the
 * appropriate point in code.
 *
 * tail needs to be long enough to be coherent, but no longer than necessary, because Claude
 * prefers shorter Assistant responses, so if the tail is too long, the returned completion
 * will be very short or empty. In practice, a good length for tail is 1-2 lines.
 */
export interface PrefixComponents {
    head: TrimmedString
    tail: TrimmedString
    overlap?: string
}

// Split string into head and tail. The tail is at most the last 2 non-empty lines of the snippet
export function getHeadAndTail(s: string): PrefixComponents {
    const lines = s.split('\n')
    const tailThreshold = 2

    let nonEmptyCount = 0
    let tailStart = -1
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim().length > 0) {
            nonEmptyCount++
        }
        if (nonEmptyCount >= tailThreshold) {
            tailStart = i
            break
        }
    }

    if (tailStart === -1) {
        return { head: trimSpace(s), tail: trimSpace(s), overlap: s }
    }

    return { head: trimSpace(lines.slice(0, tailStart).join('\n')), tail: trimSpace(lines.slice(tailStart).join('\n')) }
}

function trimSpace(s: string): TrimmedString {
    const trimmed = s.trim()
    const headEnd = s.indexOf(trimmed)
    return { trimmed, leadSpace: s.slice(0, headEnd), rearSpace: s.slice(headEnd + trimmed.length) }
}

/*
 * Trims the insertion string until the first line that matches the suffix string.
 *
 * This is to "fit" the completion from Claude back into the code we're modifying.
 * Oftentimes, the last couple of lines of the completion may match against the suffix
 * (the code following the cursor).
 */
export function trimUntilSuffix(insertion: string, prefix: string, suffix: string, languageId: string): string {
    const config = getLanguageConfig(languageId)

    if (!config) {
        return insertion
    }

    insertion = insertion.trimEnd()

    const firstNonEmptySuffixLine = getFirstNonEmptyLine(suffix)

    // TODO: Handle case for inline suffix - remove same trailing sequence from insertion
    // if we already have the same sequence in suffix

    if (firstNonEmptySuffixLine.length === 0) {
        return insertion
    }

    const prefixLastNewLine = prefix.lastIndexOf('\n')
    const prefixIndentationWithFirstCompletionLine = prefix.slice(prefixLastNewLine + 1)
    const suffixIndent = indentation(firstNonEmptySuffixLine)
    const hasEmptyCompletionLine = prefixIndentationWithFirstCompletionLine.trim() === ''

    const includeClosingLine = shouldIncludeClosingLine(prefixIndentationWithFirstCompletionLine, suffix)
    const insertionLines = insertion.split('\n')
    let cutOffIndex = insertionLines.length

    for (let i = 0; i < insertionLines.length; i++) {
        let line = insertionLines[i]

        // Include the current indentation of the prefix in the first line
        if (i === 0) {
            line = prefixIndentationWithFirstCompletionLine + line
        }

        const lineIndentation = indentation(line)
        const isSameIndentation = lineIndentation <= suffixIndent

        if (
            hasEmptyCompletionLine &&
            includeClosingLine &&
            config.blockEnd &&
            line.trim().startsWith(config.blockEnd)
        ) {
            cutOffIndex = i
            break
        }

        if (isSameIndentation && isAlmostTheSameString(line, firstNonEmptySuffixLine)) {
            cutOffIndex = i
            break
        }
    }

    return insertionLines.slice(0, cutOffIndex).join('\n')
}

function getFirstNonEmptyLine(suffix: string): string {
    const nextLineSuffix = suffix.slice(suffix.indexOf('\n'))

    for (const line of nextLineSuffix.split('\n')) {
        if (line.trim().length > 0) {
            return line
        }
    }

    return ''
}

/**
 * Trims whitespace before the first newline (if it exists).
 */
export function trimLeadingWhitespaceUntilNewline(str: string): string {
    return str.replace(/^\s+?(\r?\n)/, '$1')
}

/**
 * Collapses whitespace that appears at the end of prefix and the start of completion.
 *
 * For example, if prefix is `const isLocalhost = window.location.host ` and completion is ` ===
 * 'localhost'`, it trims the leading space in the completion to avoid a duplicate space.
 *
 * Language-specific customizations are needed here to get greater accuracy.
 */
export function collapseDuplicativeWhitespace(prefix: string, completion: string): string {
    if (prefix.endsWith(' ') || prefix.endsWith('\t')) {
        completion = completion.replace(/^[\t ]+/, '')
    }
    return completion
}

/**
 * Trims trailing whitespace on the last line if the last line is whitespace-only.
 */
export function trimEndOnLastLineIfWhitespaceOnly(text: string): string {
    return text.replace(/(\r?\n)\s+$/, '$1')
}
