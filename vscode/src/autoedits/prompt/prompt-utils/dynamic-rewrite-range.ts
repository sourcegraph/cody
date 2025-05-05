import type { Position, TextDocument } from 'vscode'
import * as vscode from 'vscode'
import type { SyntaxNode } from 'web-tree-sitter'
import {
    getPrefixWithCharLimit,
    getSuffixWithCharLimit,
} from '../../../completions/get-current-doc-context'
import { lines } from '../../../completions/text-processing'
import { asPoint, getCachedParseTreeForDocument } from '../../../tree-sitter/parse-tree-cache'
import { autoeditsOutputChannelLogger } from '../../output-channel-logger'

export interface DynamicCodeToRewriteOptions {
    codeToRewriteStartLine: number
    codeToRewriteEndLine: number
}

export function getDynamicCodeToRewrite(
    document: TextDocument,
    position: Position,
    charLimit: number,
    prefixTokenFraction = 0.1
): DynamicCodeToRewriteOptions {
    const expandToFullLine = true
    const expandedRange = getEnclosingNodeWithinCharLimit(
        document,
        position,
        charLimit,
        expandToFullLine
    )

    // Calculate actual used characters in the expanded range
    const rangeText = document.getText(expandedRange)
    const usedChars = rangeText.length
    const remainingChars = charLimit - usedChars

    const expandedStartLine = expandedRange.start.line
    const expandedEndLine = expandedRange.end.line

    // If no remaining characters, just return the expanded range
    if (remainingChars <= 0) {
        return {
            codeToRewriteStartLine: expandedStartLine,
            codeToRewriteEndLine: expandedEndLine,
        }
    }

    const prefixChars = Math.floor(remainingChars * prefixTokenFraction)
    const suffixChars = remainingChars - prefixChars

    // Get prefix and suffix text
    const remainingPrefix = document.getText(new vscode.Range(0, 0, expandedStartLine, 0))
    const remainingSuffix = document.getText(
        new vscode.Range(expandedEndLine + 1, 0, document.lineCount - 1, 0)
    )

    // Calculate how many additional lines to include from prefix and suffix
    const prefixLines = lines(getPrefixWithCharLimit(lines(remainingPrefix), prefixChars))
    const suffixLines = lines(getSuffixWithCharLimit(lines(remainingSuffix), suffixChars))

    const finalStartLine = Math.max(expandedStartLine - prefixLines.length, 0)
    const finalEndLine = Math.min(expandedEndLine + suffixLines.length, document.lineCount - 1)

    return {
        codeToRewriteStartLine: finalStartLine,
        codeToRewriteEndLine: finalEndLine,
    }
}

/**
 * Returns the largest enclosing node within a char limit, starting from the cursor position.
 * @param document The text document
 * @param cursorPosition The cursor position
 * @param charLimit The maximum number of characters allowed in the range
 * @param expandToFullLine If true, expands the range to include complete lines
 * @returns A vscode.Range representing the node's range, or a minimal range if no suitable node is found
 */
export function getEnclosingNodeWithinCharLimit(
    document: TextDocument,
    cursorPosition: Position,
    charLimit: number,
    expandToFullLine: boolean
): vscode.Range {
    const parseTreeCache = getCachedParseTreeForDocument(document)
    if (!parseTreeCache || !parseTreeCache.tree.rootNode) {
        return createCursorRange(cursorPosition)
    }

    const cursorPoint = asPoint(cursorPosition)
    let currentNode: SyntaxNode | null = parseTreeCache.tree.rootNode.descendantForPosition(cursorPoint)
    if (!currentNode) {
        return createCursorRange(cursorPosition)
    }

    let expandedNode: SyntaxNode | null = null

    while (currentNode) {
        const textLength = currentNode.endIndex - currentNode.startIndex
        if (textLength <= charLimit) {
            expandedNode = currentNode
        } else {
            break
        }
        currentNode = currentNode.parent
    }

    if (!expandedNode) {
        return createCursorRange(cursorPosition)
    }

    try {
        const range = nodeToVSCodeRange(expandedNode)
        return expandToFullLine ? expandRangeToFullLines(document, range) : range
    } catch (error) {
        autoeditsOutputChannelLogger.logDebugIfVerbose(
            'getEnclosingNodeWithinCharLimit',
            'Failed to convert node to VSCode range:',
            error
        )
        return createCursorRange(cursorPosition)
    }
}

function createCursorRange(position: Position): vscode.Range {
    return new vscode.Range(position, position)
}

function nodeToVSCodeRange(node: SyntaxNode): vscode.Range {
    if (!node.startPosition || !node.endPosition) {
        throw new Error('Invalid node: missing position information')
    }

    return new vscode.Range(
        node.startPosition.row,
        node.startPosition.column,
        node.endPosition.row,
        node.endPosition.column
    )
}

/**
 * Expands a range to include the complete lines it spans.
 * @param document The text document
 * @param range The original range to expand
 * @returns A new range that includes the complete lines
 */
function expandRangeToFullLines(document: TextDocument, range: vscode.Range): vscode.Range {
    const endLineText = document.lineAt(range.end.line)

    return new vscode.Range(
        range.start.line,
        0, // Start of the first line
        range.end.line,
        endLineText.text.length // End of the last line
    )
}
