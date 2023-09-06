import { Position, Range, TextDocument } from 'vscode'
import Parser, { Tree } from 'web-tree-sitter'

import { DocumentContext } from '../get-current-doc-context'
import { asPoint, getCachedParseTreeForDocument } from '../tree-sitter/parse-tree-cache'
import { InlineCompletionItem } from '../types'

export interface CompletionContext {
    completion: InlineCompletionItem
    document: TextDocument
    position: Position
    docContext: DocumentContext
}

export interface ParsedCompletion extends InlineCompletionItem {
    tree?: Tree
    hasParseErrors?: boolean
    // Points for parse-tree queries.
    points?: {
        // Start of completion.insertText in the parse-tree.
        start?: Parser.Point
        // End of completion.insertText in the parse-tree
        end?: Parser.Point
        // Start of the multi-line completion trigger if applicable
        trigger?: Parser.Point
    }
}

/**
 * Parses an inline code completion item using Tree-sitter and determines if the completion
 * would introduce any syntactic errors.
 */
export function parseCompletion(context: CompletionContext): ParsedCompletion {
    const { completion, document, position, docContext } = context
    const parseTreeCache = getCachedParseTreeForDocument(document)

    // Do nothig if the syntactic post-processing is not enabled.
    if (!parseTreeCache) {
        return { ...completion, hasParseErrors: false }
    }

    const { parser, tree } = parseTreeCache
    const treeWithCompletion = pasteCompletion({
        completion,
        document,
        position,
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

    if (docContext.multiline) {
        const triggerPosition = document.positionAt(docContext.prefix.lastIndexOf(docContext.multilineTrigger))

        points.trigger = {
            row: triggerPosition.line,
            column: triggerPosition.character,
        }
    }

    // Search for ERROR nodes in the completion range.
    const query = parser.getLanguage().query('(ERROR) @error')
    // TODO: query bigger range to catch higher scope syntactic errors caused by the completion.
    const matches = query.matches(treeWithCompletion.rootNode, points?.trigger || points.start, points.end)

    return {
        ...completion,
        points,
        tree: treeWithCompletion,
        hasParseErrors: matches.length > 0,
    }
}

interface PasteCompletionParams {
    completion: InlineCompletionItem
    document: TextDocument
    position: Position
    docContext: DocumentContext
    tree: Tree
    parser: Parser
}

function pasteCompletion(params: PasteCompletionParams): Tree {
    const {
        completion: { range, insertText },
        document,
        position,
        docContext,
        tree,
        parser,
    } = params

    // Adjust suffix and prefix based on completion insert range.
    const prefix = range ? document.getText(new Range(new Position(0, 0), range.start as Position)) : docContext.prefix
    const suffix = range
        ? document.getText(new Range(range.end as Position, document.positionAt(document.getText().length)))
        : docContext.suffix

    const textWithCompletion = prefix + insertText + suffix

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

    // TODO: consider parsing only the changed part of the document to improve performance.
    // parser.parse(textWithCompletion, tree, { includedRanges: [...]})
    return parser.parse(textWithCompletion, treeCopy)
}

export function parsedCompletionToCompletion(completion: ParsedCompletion): InlineCompletionItem {
    return {
        range: completion.range,
        insertText: completion.insertText,
    }
}
