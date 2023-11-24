import detectIndent from 'detect-indent'

import { getLanguageConfig } from '../../tree-sitter/language'

import { getEditorTabSize, indentation, shouldIncludeClosingLine } from './utils'

export function normalizeStartLine(completion: string, prefix: string): string {
    const lines = completion.split('\n')

    // We use a whitespace counting approach to finding the end of the
    // completion. To find an end, we look for the first line that is below the
    // start scope of the completion ( calculated by the number of leading
    // spaces or tabs)
    const prefixLastNewline = prefix.lastIndexOf('\n')
    const prefixIndentationWithFirstCompletionLine = prefix.slice(prefixLastNewline + 1)
    const startIndent = indentation(prefixIndentationWithFirstCompletionLine)

    // Normalize responses that start with a newline followed by the exact
    // indentation of the first line.
    if (lines.length > 1 && lines[0] === '' && indentation(lines[1]) === startIndent) {
        lines.shift()
        lines[0] = lines[0].trimStart()
    }

    return lines.join('\n')
}

export function truncateMultilineCompletion(
    completion: string,
    prefix: string,
    suffix: string,
    languageId: string
): string {
    const config = getLanguageConfig(languageId)

    if (!config) {
        return completion
    }

    // Ensure that the completion has the same or larger indentation
    // because we rely on the indentation size to cut off the completion.
    // TODO: add unit tests for this case. We need to update the indentation logic
    // used in unit tests for code samples.
    const indentedCompletion = ensureSameOrLargerIndentation(completion)
    const lines = indentedCompletion.split('\n')

    // We use a whitespace counting approach to finding the end of the
    // completion. To find an end, we look for the first line that is below the
    // start scope of the completion ( calculated by the number of leading
    // spaces or tabs)
    const prefixLastNewline = prefix.lastIndexOf('\n')
    const prefixIndentationWithFirstCompletionLine = prefix.slice(prefixLastNewline + 1)
    const startIndent = indentation(prefixIndentationWithFirstCompletionLine)
    const hasEmptyCompletionLine = prefixIndentationWithFirstCompletionLine.trim() === ''

    const includeClosingLine = shouldIncludeClosingLine(prefixIndentationWithFirstCompletionLine, suffix)

    let cutOffIndex = lines.length
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        if (i === 0 || line === '' || config.blockElseTest.test(line)) {
            continue
        }

        if (
            (indentation(line) <= startIndent && !hasEmptyCompletionLine) ||
            (indentation(line) < startIndent && hasEmptyCompletionLine)
        ) {
            // When we find the first block below the start indentation, only
            // include it if it is an end block
            if (includeClosingLine && config.blockEnd && line.trim().startsWith(config.blockEnd)) {
                cutOffIndex = i + 1
            } else {
                cutOffIndex = i
            }
            break
        }
    }

    return lines.slice(0, cutOffIndex).join('\n')
}

/**
 * Adjusts the indentation of a multiline completion to match the current editor indentation.
 */
function adjustIndentation(text: string, originalIndent: number, newIndent: number): string {
    const lines = text.split('\n')

    return lines
        .map(line => {
            let spaceCount = 0
            for (const char of line) {
                if (char === ' ') {
                    spaceCount++
                } else {
                    break
                }
            }

            const indentLevel = spaceCount / originalIndent

            if (Number.isInteger(indentLevel)) {
                const newIndentStr = ' '.repeat(indentLevel * newIndent)
                return line.replace(/^ +/, newIndentStr)
            }

            // The line has a non-standard number of spaces at the start, leave it unchanged
            return line
        })
        .join('\n')
}

function ensureSameOrLargerIndentation(completion: string): string {
    const indentAmount = detectIndent(completion).amount
    const editorTabSize = getEditorTabSize()

    if (editorTabSize > indentAmount) {
        return adjustIndentation(completion, indentAmount, editorTabSize)
    }

    return completion
}
