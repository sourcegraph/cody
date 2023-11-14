import { Position, Range, TextDocument } from 'vscode'
import Parser, { Point, Tree } from 'web-tree-sitter'

import { DocumentContext } from '../get-current-doc-context'
import { asPoint, getCachedParseTreeForDocument } from '../tree-sitter/parse-tree-cache'
import { InlineCompletionItem } from '../types'

import { getMatchingSuffixLength, InlineCompletionItemWithAnalytics } from './process-inline-completions'

export interface CompletionContext {
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
        docContext: { prefix, position, multilineTrigger },
    } = context
    const parseTreeCache = getCachedParseTreeForDocument(document)

    // Do nothig if the syntactic post-processing is not enabled.
    if (!parseTreeCache) {
        return completion
    }

    const { parser, tree } = parseTreeCache
    const treeWithCompletion = pasteCompletion({
        completion,
        document,
        docContext,
        tree,
        parser,
    })

    const completionEndPosition = position.translate(0, completion.insertText.length)

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

    if (multilineTrigger) {
        const triggerPosition = document.positionAt(prefix.lastIndexOf(multilineTrigger))

        points.trigger = {
            row: triggerPosition.line,
            column: triggerPosition.character,
        }
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
}

function pasteCompletion(params: PasteCompletionParams): Tree {
    const {
        completion: { range, insertText },
        document,
        docContext,
        tree,
        parser,
        docContext: { position, currentLineSuffix },
    } = params

    const matchingSuffixLength = getMatchingSuffixLength(insertText, currentLineSuffix)

    // Adjust suffix and prefix based on completion insert range.
    const prefix = range ? document.getText(new Range(new Position(0, 0), range.start)) : docContext.prefix
    const suffix = range
        ? document.getText(new Range(range.end, document.positionAt(document.getText().length)))
        : docContext.suffix

    // Remove the characters that are being replaced by the completion to avoid having
    // them in the parse tree. It breaks the multiline truncation logic which looks for
    // the increased number of children in the tree.
    const textWithCompletion = prefix + insertText + suffix.slice(matchingSuffixLength)

    const treeCopy = tree.copy()
    const completionEndPosition = position.translate(undefined, insertText.length)

    treeCopy.edit({
        startIndex: prefix.length,
        oldEndIndex: prefix.length,
        newEndIndex: prefix.length + insertText.length,
        startPosition: asPoint(position),
        oldEndPosition: asPoint(range?.end || position),
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
