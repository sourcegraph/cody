import * as vscode from 'vscode'

import { getNextNonEmptyLine, getPrevNonEmptyLine } from './utils/text-utils'

export interface DocumentContext {
    prefix: string
    suffix: string

    /** Text before the cursor on the same line. */
    currentLinePrefix: string
    /** Text after the cursor on the same line. */
    currentLineSuffix: string

    prevNonEmptyLine: string
    nextNonEmptyLine: string
}

/**
 * Get the current document context based on the cursor position in the current document.
 *
 * This function is meant to provide a context around the current position in the document,
 * including a prefix, a suffix, the previous line, the previous non-empty line, and the next non-empty line.
 * The prefix and suffix are obtained by looking around the current position up to a max length
 * defined by `maxPrefixLength` and `maxSuffixLength` respectively. If the length of the entire
 * document content in either direction is smaller than these parameters, the entire content will be used.
 *
 * @param document - A `vscode.TextDocument` object, the document in which to find the context.
 * @param position - A `vscode.Position` object, the position in the document from which to find the context.
 * @param maxPrefixLength - A number representing the maximum length of the prefix to get from the document.
 * @param maxSuffixLength - A number representing the maximum length of the suffix to get from the document.
 *
 * @returns An object containing the current document context or null if there are no lines in the document.
 */
export function getCurrentDocContext(
    document: vscode.TextDocument,
    position: vscode.Position,
    maxPrefixLength: number,
    maxSuffixLength: number,
    context: vscode.InlineCompletionContext
): DocumentContext {
    const offset = document.offsetAt(position)

    // TODO(philipp-spiess): This requires us to read the whole document. Can we limit our ranges
    // instead?
    let completePrefix = document.getText(new vscode.Range(new vscode.Position(0, 0), position))
    const completeSuffix = document.getText(new vscode.Range(position, document.positionAt(document.getText().length)))

    // Patch the document to contain the selected completion from the popup dialog already
    if (context.selectedCompletionInfo) {
        const { range, text } = context.selectedCompletionInfo
        completePrefix = completePrefix.slice(0, range.start.character - position.character) + text
    }

    const prefixLines = completePrefix.split('\n')
    const suffixLines = completeSuffix.split('\n')

    const currentLinePrefix = prefixLines[prefixLines.length - 1]
    const currentLineSuffix = suffixLines[0]

    let prefix: string
    if (offset > maxPrefixLength) {
        let total = 0
        let startLine = prefixLines.length
        for (let i = prefixLines.length - 1; i >= 0; i--) {
            if (total + prefixLines[i].length > maxPrefixLength) {
                break
            }
            startLine = i
            total += prefixLines[i].length
        }
        prefix = prefixLines.slice(startLine).join('\n')
    } else {
        prefix = completePrefix
    }

    let totalSuffix = 0
    let endLine = 0
    for (let i = 0; i < suffixLines.length; i++) {
        if (totalSuffix + suffixLines[i].length > maxSuffixLength) {
            break
        }
        endLine = i + 1
        totalSuffix += suffixLines[i].length
    }
    const suffix = suffixLines.slice(0, endLine).join('\n')

    const prevNonEmptyLine = getPrevNonEmptyLine(prefix)
    const nextNonEmptyLine = getNextNonEmptyLine(suffix)

    return {
        prefix,
        suffix,
        currentLinePrefix,
        currentLineSuffix,
        prevNonEmptyLine,
        nextNonEmptyLine,
    }
}
