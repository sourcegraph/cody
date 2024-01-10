import { type TextDocument } from 'vscode'
import { type Point, type SyntaxNode } from 'web-tree-sitter'

import { addAutocompleteDebugEvent } from '../../services/open-telemetry/debug-utils'
import { getCachedParseTreeForDocument } from '../../tree-sitter/parse-tree-cache'
import { type DocumentContext } from '../get-current-doc-context'

import { parseCompletion, type ParsedCompletion } from './parse-completion'
import { BRACKET_PAIR, getFirstLine, type OpeningBracket } from './utils'

interface CompletionContext {
    completion: ParsedCompletion
    document: TextDocument
    docContext: DocumentContext
}

interface InsertMissingBracketParams {
    textToCheck: string
    textToComplete: string
    docContext: DocumentContext
}

/**
 * Inserts a closing bracket if the text to check ends with an opening bracket
 * but the next non-empty line does not start with the corresponding closing bracket.
 * This handles cases where a missing bracket breaks the incomplete parse-tree.
 */
function insertMissingBracketIfNeeded(params: InsertMissingBracketParams): string {
    const {
        textToCheck,
        textToComplete,
        docContext: { nextNonEmptyLine },
    } = params

    const openingBracket = Object.keys(BRACKET_PAIR).find(openingBracket =>
        textToCheck.trimEnd().endsWith(openingBracket)
    ) as OpeningBracket | undefined

    const closingBracket = openingBracket && BRACKET_PAIR[openingBracket]
    if (closingBracket && !nextNonEmptyLine.startsWith(closingBracket) && !textToComplete.endsWith(closingBracket)) {
        return textToComplete + closingBracket
    }

    return textToComplete
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
    let updatedText = insertMissingBracketIfNeeded({
        textToCheck: getFirstLine(insertText),
        textToComplete: insertText,
        docContext,
    })
    updatedText = insertMissingBracketIfNeeded({
        textToCheck: updatedText,
        textToComplete: updatedText,
        docContext,
    })

    if (updatedText.length !== insertText.length) {
        const updatedCompletion = parseCompletion({
            completion: { insertText: updatedText },
            document,
            docContext,
        })

        if (fixedCompletion?.tree) {
            fixedCompletion = updatedCompletion
        }
    }

    const nodeToInsert = findLastAncestorOnTheSameRow(fixedCompletion.tree!.rootNode, points.trigger || points.start)

    let textToInsert = nodeToInsert?.id === fixedCompletion.tree!.rootNode.id ? 'root' : nodeToInsert?.text
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

    while (current?.parent?.startPosition.row === initial?.startPosition.row && current.parent.id !== root.id) {
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
