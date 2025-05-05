import type { Position, TextDocument } from 'vscode'
import * as vscode from 'vscode'
import type { SyntaxNode } from 'web-tree-sitter'
import { asPoint, getCachedParseTreeForDocument } from '../../../tree-sitter/parse-tree-cache'
import { autoeditsOutputChannelLogger } from '../../output-channel-logger'

/**
 * Returns the largest enclosing node within a character limit, starting from the cursor position.
 * @param document The text document
 * @param cursorPosition The cursor position
 * @param charLimit The maximum number of characters allowed in the range
 * @returns A vscode.Range representing the node's range, or a minimal range if no suitable node is found
 */
export function getEnclosingNodeWithinCharLimit(
    document: TextDocument,
    cursorPosition: Position,
    charLimit: number
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
        return nodeToVSCodeRange(expandedNode)
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
