import { TextDocument } from 'vscode'

import { getCachedParseTreeForDocument } from '../tree-sitter/parse-tree-cache'
import { DocumentQuerySDK } from '../tree-sitter/query-sdk'

import { ParsedCompletion } from './parse-completion'

interface CompletionContext {
    completion: ParsedCompletion
    document: TextDocument
    documentQuerySDK: DocumentQuerySDK
}

/**
 * Truncates the `insertText` of a `ParsedCompletion` based on the syntactic structure
 * of the code in a given `TextDocument`. Currently supports only JavaScript and TypeScript.
 *
 * Uses `tree-sitter` to query specific code blocks for contextual truncation.
 * Returns the original `insertText` if no truncation is needed or if syntactic post-processing isn't enabled.
 */
export function truncateParsedCompletion(context: CompletionContext): string {
    const { completion, document, documentQuerySDK } = context
    const parseTreeCache = getCachedParseTreeForDocument(document)

    if (!completion.tree || !completion.points || !parseTreeCache) {
        throw new Error('Expected completion and document to have tree-sitter data for truncation')
    }

    const { tree, points } = completion

    const queryStart = points?.trigger || points?.start
    const [captureGroup] = documentQuerySDK.queries.blocks.getFirstMultilineBlockForTruncation(
        tree.rootNode,
        queryStart,
        {
            row: queryStart.row,
            column: queryStart.column + 1,
        }
    )

    if (captureGroup) {
        const overlap = findLargestSuffixPrefixOverlap(captureGroup.node.text, completion.insertText)

        if (overlap) {
            return overlap
        }
    }

    return completion.insertText
}

/**
 * Finds the maximum suffix-prefix overlap between two strings.
 */
function findLargestSuffixPrefixOverlap(left: string, right: string): string | null {
    let overlap = ''

    for (let i = 1; i <= Math.min(left.length, right.length); i++) {
        const suffix = left.slice(left.length - i)
        const prefix = right.slice(0, i)

        if (suffix === prefix) {
            overlap = suffix
        }
    }

    if (overlap.length === 0) {
        return null
    }

    return overlap
}
