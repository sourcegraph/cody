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
    queryStartPosition?: Parser.Point
    queryEndPosition?: Parser.Point
}

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
    const queryStartPosition: Parser.Point = {
        row: position.line,
        column: position.character,
    }
    const queryEndPosition: Parser.Point = {
        row: completionEndPosition.line,
        column: completionEndPosition.character,
    }

    // Search for ERROR nodes in the completion range.
    const query = parser.getLanguage().query('(ERROR) @error')
    const matches = query.matches(treeWithCompletion.rootNode, queryStartPosition, queryEndPosition)

    return {
        ...completion,
        queryStartPosition,
        queryEndPosition,
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
    console.log(textWithCompletion)

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
