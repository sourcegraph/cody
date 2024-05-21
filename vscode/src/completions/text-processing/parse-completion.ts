import type { TextDocument } from 'vscode'
import type { default as Parser, Point, Tree } from 'web-tree-sitter'

import { addAutocompleteDebugEvent } from '../../services/open-telemetry/debug-utils'
import { asPoint, getCachedParseTreeForDocument } from '../../tree-sitter/parse-tree-cache'
import type { InlineCompletionItem } from '../types'

import type { DocumentContext } from '@sourcegraph/cody-shared'
import type { WrappedParser } from '../../tree-sitter/parser'
import {
    type InlineCompletionItemWithAnalytics,
    getMatchingSuffixLength,
} from './process-inline-completions'

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

    // Do nothing if the syntactic post-processing is not enabled.
    if (!parseTreeCache) {
        return completion
    }

    const { parser, tree } = parseTreeCache
    const { treeWithCompletion, completionEndPosition } = pasteCompletion({
        completion,
        document,
        docContext,
        tree,
        parser,
    })

    if (!treeWithCompletion) {
        return completion
    }

    const points: ParsedCompletion['points'] = {
        start: asPoint(position),
        end: completionEndPosition,
    }

    if (multilineTriggerPosition) {
        points.trigger = asPoint(multilineTriggerPosition)
    }

    // Search for ERROR nodes in the completion range.
    const query = parser.getLanguage().query('(ERROR) @error')
    // TODO(tree-sitter): query bigger range to catch higher scope syntactic errors caused by the completion.
    const captures = query.captures(
        treeWithCompletion.rootNode,
        points?.trigger || points.start,
        points.end
    )

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
    parser: WrappedParser
}

interface PasteCompletionResult {
    treeWithCompletion?: Tree
    completionEndPosition: Point
}

function pasteCompletion(params: PasteCompletionParams): PasteCompletionResult {
    const {
        completion: { insertText },
        document,
        tree,
        parser,
        docContext: {
            position,
            currentLineSuffix,
            positionWithoutInjectedCompletionText = position,
            injectedCompletionText = '',
        },
    } = params

    const matchingSuffixLength = getMatchingSuffixLength(insertText, currentLineSuffix)

    // Remove the characters that are being replaced by the completion to avoid having
    // them in the parse tree. It breaks the multiline truncation logic which looks for
    // the increased number of children in the tree.
    const { textWithCompletion, edit } = spliceInsertText({
        currentText: document.getText(),
        startIndex: document.offsetAt(positionWithoutInjectedCompletionText),
        lengthRemoved: matchingSuffixLength,
        insertText: injectedCompletionText + insertText,
    })

    const treeCopy = tree.copy()
    treeCopy.edit(edit)

    // TODO(tree-sitter): consider parsing only the changed part of the document to improve performance.
    // parser.parse(textWithCompletion, tree, { includedRanges: [...]})
    const treeWithCompletion = parser.observableParse(textWithCompletion, treeCopy)
    addAutocompleteDebugEvent('paste-completion', {
        text: textWithCompletion,
    })

    return {
        treeWithCompletion,
        completionEndPosition: edit.newEndPosition,
    }
}

interface SpliceInsertTextParams {
    currentText: string
    insertText: string
    startIndex: number
    lengthRemoved: number
}

interface SpliceInsertTextResult {
    textWithCompletion: string
    edit: Parser.Edit
}

function spliceInsertText(params: SpliceInsertTextParams): SpliceInsertTextResult {
    const { currentText, insertText, startIndex, lengthRemoved } = params

    const oldEndIndex = startIndex + lengthRemoved
    const newEndIndex = startIndex + insertText.length

    const startPosition = getExtent(currentText.slice(0, startIndex))
    const oldEndPosition = getExtent(currentText.slice(0, oldEndIndex))
    const textWithCompletion =
        currentText.slice(0, startIndex) + insertText + currentText.slice(oldEndIndex)

    const newEndPosition = getExtent(textWithCompletion.slice(0, newEndIndex))

    return {
        textWithCompletion,
        edit: {
            startIndex,
            startPosition,
            oldEndIndex,
            oldEndPosition,
            newEndIndex,
            newEndPosition,
        },
    }
}

function getExtent(text: string): Point {
    let row = 0
    let index = 0
    for (index = 0; index !== -1; index = text.indexOf('\n', index)) {
        index++
        row++
    }
    return { row, column: text.length - index }
}

export function dropParserFields(completion: ParsedCompletion): InlineCompletionItemWithAnalytics {
    const { points, tree, ...rest } = completion

    return rest
}
