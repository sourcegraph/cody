import { Position, Range, type TextDocument } from 'vscode'
import { type default as Parser, type Point, type Tree } from 'web-tree-sitter'

import { asPoint, getCachedParseTreeForDocument } from '../../tree-sitter/parse-tree-cache'
import { type DocumentContext } from '../get-current-doc-context'
import { type InlineCompletionItem } from '../types'

import { getMatchingSuffixLength, type InlineCompletionItemWithAnalytics } from './process-inline-completions'
import { getLastLine, lines } from './utils'

interface CompletionContext {
    completion: InlineCompletionItem
    document: TextDocument
    docContext: DocumentContext
}

export interface ParsedCompletion extends InlineCompletionItemWithAnalytics {
    tree?: Tree
    parseErrorCount?: number
    // Points for parse-tree queries.
    points?: {
        // Start of completion.insertText in the parse-tree.
        start: Point
        // End of completion.insertText in the parse-tree
        end: Point
        // Start of the multi-line completion trigger if applicable
        trigger?: Point
    }
}

/**
 * Parses an inline code completion item using Tree-sitter and determines if the completion
 * would introduce any syntactic errors.
 */
export function parseCompletion(context: CompletionContext): ParsedCompletion {
    const {
        completion,
        document,
        docContext,
        docContext: { position, multilineTriggerPosition },
    } = context
    const parseTreeCache = getCachedParseTreeForDocument(document)

    // Do nothig if the syntactic post-processing is not enabled.
    if (!parseTreeCache) {
        return completion
    }

    const { parser, tree } = parseTreeCache

    const completionEndPosition = position.translate(
        lines(completion.insertText).length,
        getLastLine(completion.insertText).length
    )

    const treeWithCompletion = pasteCompletion({
        completion,
        document,
        docContext,
        tree,
        parser,
        completionEndPosition,
    })

    const points: ParsedCompletion['points'] = {
        start: {
            row: position.line,
            column: position.character,
        },
        end: {
            row: completionEndPosition.line,
            column: completionEndPosition.character,
        },
    }

    if (multilineTriggerPosition) {
        points.trigger = asPoint(multilineTriggerPosition)
    }

    // Search for ERROR nodes in the completion range.
    const query = parser.getLanguage().query('(ERROR) @error')
    // TODO(tree-sitter): query bigger range to catch higher scope syntactic errors caused by the completion.
    const captures = query.captures(treeWithCompletion.rootNode, points?.trigger || points.start, points.end)

    return {
        ...completion,
        points,
        tree: treeWithCompletion,
        parseErrorCount: captures.length,
    }
}

interface PasteCompletionParams {
    completion: InlineCompletionItem
    document: TextDocument
    docContext: DocumentContext
    tree: Tree
    parser: Parser
    completionEndPosition: Position
}

function pasteCompletion(params: PasteCompletionParams): Tree {
    const {
        completion: { insertText },
        document,
        tree,
        parser,
        docContext: { position, currentLineSuffix },
        completionEndPosition,
    } = params

    const matchingSuffixLength = getMatchingSuffixLength(insertText, currentLineSuffix)

    // Adjust suffix and prefix based on completion insert range.
    const prefix = document.getText(new Range(new Position(0, 0), position))
    const suffix = document.getText(new Range(position, document.positionAt(document.getText().length)))

    const offset = document.offsetAt(position)

    // Remove the characters that are being replaced by the completion to avoid having
    // them in the parse tree. It breaks the multiline truncation logic which looks for
    // the increased number of children in the tree.
    const textWithCompletion = prefix + insertText + suffix.slice(matchingSuffixLength)

    const treeCopy = tree.copy()

    treeCopy.edit({
        startIndex: offset,
        oldEndIndex: offset,
        newEndIndex: offset + insertText.length,
        startPosition: asPoint(position),
        oldEndPosition: asPoint(position),
        newEndPosition: asPoint(completionEndPosition),
    })

    // TODO(tree-sitter): consider parsing only the changed part of the document to improve performance.
    // parser.parse(textWithCompletion, tree, { includedRanges: [...]})
    return parser.parse(textWithCompletion, treeCopy)
}

export function dropParserFields(completion: ParsedCompletion): InlineCompletionItemWithAnalytics {
    const { points, tree, ...rest } = completion

    return rest
}
