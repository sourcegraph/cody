import type { TextDocument } from 'vscode'
import type { Point, SyntaxNode } from 'web-tree-sitter'

import { addAutocompleteDebugEvent } from '../../services/open-telemetry/debug-utils'
import { getCachedParseTreeForDocument } from '../../tree-sitter/parse-tree-cache'
import type { DocumentContext } from '../get-current-doc-context'

import { type ParsedCompletion, parseCompletion } from './parse-completion'
import { BRACKET_PAIR, type OpeningBracket } from './utils'

interface CompletionContext {
    completion: ParsedCompletion
    document: TextDocument
    docContext: DocumentContext
}

/**
 * Inserts missing closing brackets in the completion text.
 * This handles cases where a missing bracket breaks the incomplete parse-tree.
 */
export function insertMissingBrackets(text: string): string {
    const openingStack: OpeningBracket[] = []
    const bracketPairs = Object.entries(BRACKET_PAIR)

    for (const char of text) {
        const bracketPair = bracketPairs.find(([_, closingBracket]) => closingBracket === char)

        if (bracketPair) {
            if (openingStack.length > 0 && openingStack.at(-1) === bracketPair[0]) {
                openingStack.pop()
            }
        } else if (Object.keys(BRACKET_PAIR).includes(char)) {
            openingStack.push(char as OpeningBracket)
        }
    }

    return (
        text +
        openingStack
            .reverse()
            .map(openBracket => BRACKET_PAIR[openBracket])
            .join('')
    )
}

interface TruncateParsedCompletionResult {
    insertText: string
    nodeToInsert?: SyntaxNode
}

/**
 * Truncates the insert text of a parsed completion based on context.
 * Uses tree-sitter to walk the parse-tree with the inserted completion and truncate it.
 */
export function truncateParsedCompletion(context: CompletionContext): TruncateParsedCompletionResult {
    const { completion, document, docContext } = context
    const parseTreeCache = getCachedParseTreeForDocument(document)

    if (!completion.tree || !completion.points || !parseTreeCache) {
        throw new Error('Expected completion and document to have tree-sitter data for truncation')
    }

    const { insertText, points } = completion
    addAutocompleteDebugEvent('truncate', {
        currentLinePrefix: docContext.currentLinePrefix,
        text: insertText,
    })

    let fixedCompletion = completion

    const insertTextWithMissingBrackets = insertMissingBrackets(
        docContext.currentLinePrefix + insertText
    ).slice(docContext.currentLinePrefix.length)

    if (insertTextWithMissingBrackets.length !== insertText.length) {
        const updatedCompletion = parseCompletion({
            completion: { insertText: insertTextWithMissingBrackets },
            document,
            docContext,
        })

        if (fixedCompletion?.tree) {
            fixedCompletion = updatedCompletion
        }
    }

    const nodeToInsert = findLastAncestorOnTheSameRow(
        fixedCompletion.tree!.rootNode,
        points.trigger || points.start
    )

    let textToInsert =
        nodeToInsert?.id === fixedCompletion.tree!.rootNode.id ? 'root' : nodeToInsert?.text
    if (textToInsert && document.getText().endsWith(textToInsert.slice(-100))) {
        textToInsert = 'till the end of the document'
    }

    addAutocompleteDebugEvent('truncate node', {
        nodeToInsertType: nodeToInsert?.type,
        text: textToInsert,
    })

    if (nodeToInsert) {
        const overlap = findLargestSuffixPrefixOverlap(nodeToInsert.text, insertText)
        addAutocompleteDebugEvent('truncate overlap', {
            currentLinePrefix: docContext.currentLinePrefix,
            text: overlap ?? undefined,
        })

        if (overlap) {
            return {
                insertText: overlap,
                nodeToInsert,
            }
        }
    }

    return { insertText, nodeToInsert: nodeToInsert || undefined }
}

export function findLastAncestorOnTheSameRow(root: SyntaxNode, position: Point): SyntaxNode | null {
    const initial = root.namedDescendantForPosition(position)
    let current = initial

    while (
        current?.parent?.startPosition.row === initial?.startPosition.row &&
        current.parent.id !== root.id
    ) {
        current = current.parent
    }

    return current
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
