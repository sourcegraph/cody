import { memoize } from 'lodash'
import { TextDocument } from 'vscode'
import { Point, SyntaxNode } from 'web-tree-sitter'

import { DocumentContext } from '../get-current-doc-context'
import { getCachedParseTreeForDocument } from '../tree-sitter/parse-tree-cache'

import { parseCompletion, ParsedCompletion } from './parse-completion'

interface CompletionContext {
    completion: ParsedCompletion
    document: TextDocument
    docContext: DocumentContext
}

/**
 * Only the first argument is used as a memoization key.
 * Use the memoized function to avoid re-parsing the completion's first line multiple times.
 */
const parseCompletionFirstLineMemoized = memoize((firstLine: string, context: Omit<CompletionContext, 'completion'>) =>
    parseCompletion({
        completion: { insertText: firstLine },
        ...context,
    })
)

/**
 * Truncates the `insertText` of a `ParsedCompletion` based on the next sibling inserted
 * into the parse tree.
 *
 * Uses `tree-sitter` to walk the parse tree from the node at the end of the current line
 * and looks for a node with the updated number of children.
 */
export function truncateParsedCompletionByNextSibling(context: CompletionContext): string {
    const { completion, document, docContext } = context
    const parseTreeCache = getCachedParseTreeForDocument(document)

    const firstLine = completion.insertText.split('\n').shift() || completion.insertText
    const parsedFirstLine = parseCompletionFirstLineMemoized(firstLine, {
        document,
        docContext,
    })

    if (!completion.tree || !completion.points || !parseTreeCache || !parsedFirstLine.tree) {
        throw new Error('Expected completion and document to have tree-sitter data for truncation')
    }

    const { insertText, points } = completion

    const queryStart = points?.trigger || points?.start
    const nodeToInsert = findChildBeforeTheNewSibling(
        parsedFirstLine.tree.rootNode,
        completion.tree.rootNode,
        queryStart
    )

    if (nodeToInsert) {
        const overlap = findLargestSuffixPrefixOverlap(nodeToInsert.text, insertText)

        if (overlap) {
            return overlap
        }
    }

    return insertText
}

// Number of ancestor nodes to check for changes in child count.
// Set by heuristic: higher values add unnecessary performance cost with no benefit.
const PARENTS_TO_CHECK = 7
const NODE_TYPES_WITH_MULTIPLE_BLOCK_STATEMENTS = new Set(['if_statement', 'try_statement'])

/**
 * Finds the nearest sibling node before an insertion point in a syntax tree.
 *
 * This function compares two syntax trees: one before and one after a change. It starts
 * at the cursor position and moves up the tree, checking a fixed number of ancestor nodes
 * to find where the new sibling would be inserted. The comparison stops if the number of
 * children changes, indicating the potential point of insertion. This is used to inform
 * how completion suggestions should be truncated.
 */
function findChildBeforeTheNewSibling(
    prevRoot: SyntaxNode,
    currentRoot: SyntaxNode,
    cursorPosition: Point
): SyntaxNode | null {
    let prevNode = namedNodeOrParent(prevRoot.descendantForPosition(cursorPosition))
    let currentNode = namedNodeOrParent(currentRoot.descendantForPosition(cursorPosition))

    for (let i = 0; i < PARENTS_TO_CHECK; i++) {
        if (!currentNode?.parent || !prevNode?.parent) {
            break
        }

        if (prevNode.parent.childCount !== currentNode.parent.childCount) {
            if (NODE_TYPES_WITH_MULTIPLE_BLOCK_STATEMENTS.has(currentNode.parent.type)) {
                return currentNode.parent
            }
            return currentNode
        }

        currentNode = currentNode.parent
        prevNode = prevNode.parent
    }

    return null
}

function namedNodeOrParent(node: SyntaxNode): SyntaxNode | null {
    return node.isNamed() ? node : node.parent
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
