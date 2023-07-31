import * as vscode from 'vscode'

export const INDENTATION_REGEX = /^[\t ]*/
export const OPENING_BRACKET_REGEX = /([([{])$/

export const BRACKET_PAIR = {
    '(': ')',
    '[': ']',
    '{': '}',
} as const

export function getEditorTabSize(): number {
    return vscode.window.activeTextEditor ? (vscode.window.activeTextEditor.options.tabSize as number) : 2
}

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

/**
 * If a completion starts with an opening bracket and a suffix starts with
 * the corresponding closing bracket, we include the last closing bracket of the completion.
 * E.g., function foo(__CURSOR__)
 *
 * We can do this because we know that the existing block is already closed, which means that
 * new blocks need to be closed separately.
 * E.g. function foo() { console.log('hello') }
 */
function shouldIncludeClosingLineBasedOnBrackets(
    prefixIndentationWithFirstCompletionLine: string,
    suffix: string
): boolean {
    const matches = prefixIndentationWithFirstCompletionLine.match(OPENING_BRACKET_REGEX)

    if (matches && matches.length > 0) {
        const openingBracket = matches[0] as keyof typeof BRACKET_PAIR
        const closingBracket = BRACKET_PAIR[openingBracket]

        return Boolean(openingBracket) && suffix.startsWith(closingBracket)
    }

    return false
}

/**
 * Only include a closing line (e.g. `}`) if the block is empty yet if the block is already closed.
 * We detect this by looking at the indentation of the next non-empty line.
 */
export function shouldIncludeClosingLine(prefixIndentationWithFirstCompletionLine: string, suffix: string): boolean {
    const includeClosingLineBasedOnBrackets = shouldIncludeClosingLineBasedOnBrackets(
        prefixIndentationWithFirstCompletionLine,
        suffix
    )

    const startIndent = indentation(prefixIndentationWithFirstCompletionLine)

    const firstNewLineIndex = suffix.indexOf('\n') + 1
    const nextNonEmptyLine =
        suffix
            .slice(firstNewLineIndex)
            .split('\n')
            .find(line => line.trim().length > 0) ?? ''

    return indentation(nextNonEmptyLine) < startIndent || includeClosingLineBasedOnBrackets
}
