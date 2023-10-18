import { Position, TextDocument } from 'vscode'
import { Tree } from 'web-tree-sitter'

import { dedupeWith } from '@sourcegraph/cody-shared/src/common'

import { DocumentContext } from '../get-current-doc-context'
import { ItemPostProcessingInfo } from '../logger'
import { getNodeAtCursorAndParents } from '../tree-sitter/ast-getters'
import { asPoint, getCachedParseTreeForDocument } from '../tree-sitter/parse-tree-cache'
import { InlineCompletionItem } from '../types'

import { dropParserFields, ParsedCompletion } from './parse-completion'
import { collapseDuplicativeWhitespace, removeTrailingWhitespace, trimUntilSuffix } from './utils'

export interface ProcessInlineCompletionsParams {
    document: TextDocument
    position: Position
    docContext: DocumentContext
}

export interface InlineCompletionItemWithAnalytics extends ItemPostProcessingInfo, InlineCompletionItem {
    stopReason?: string
}

/**
 * This function implements post-processing logic that is applied regardless of
 * which provider is chosen.
 */
export function processInlineCompletions(
    items: ParsedCompletion[],
    params: ProcessInlineCompletionsParams
): InlineCompletionItemWithAnalytics[] {
    // Shared post-processing logic
    const completionItems = items.map(item => processCompletion(item, params))

    // Remove low quality results
    const visibleResults = removeLowQualityCompletions(completionItems)

    // Remove duplicate results
    const uniqueResults = dedupeWith(visibleResults, 'insertText')

    // Rank results
    const rankedResults = rankCompletions(uniqueResults)

    return rankedResults.map(dropParserFields)
}

interface ProcessItemParams {
    document: TextDocument
    position: Position
    docContext: DocumentContext
}

function processCompletion(completion: ParsedCompletion, params: ProcessItemParams): ParsedCompletion {
    const { document, position, docContext } = params
    const { prefix, suffix, currentLineSuffix, multilineTrigger } = docContext
    let { insertText } = completion

    if (docContext.injectedPrefix) {
        insertText = docContext.injectedPrefix + completion.insertText
    }

    if (insertText.length === 0) {
        return completion
    }

    completion.range = getRangeAdjustedForOverlappingCharacters(completion, { position, currentLineSuffix })

    // Use the parse tree WITHOUT the pasted completion to get surrounding node types.
    // Helpful to optimize the completion AST triggers for higher CAR.
    completion.nodeTypes = getNodeTypesInfo(position, getCachedParseTreeForDocument(document)?.tree)

    // Use the parse tree WITH the pasted completion to get surrounding node types.
    // Helpful to understand CAR for incomplete code snippets.
    // E.g., `const value = ` does not produce a valid AST, but `const value = 'someValue'` does
    completion.nodeTypesWithCompletion = getNodeTypesInfo(position, completion.tree)

    if (multilineTrigger) {
        insertText = removeTrailingWhitespace(insertText)
    } else {
        // Only keep a single line in single-line completions mode
        const newLineIndex = insertText.indexOf('\n')
        if (newLineIndex !== -1) {
            insertText = insertText.slice(0, newLineIndex + 1)
        }
    }

    insertText = trimUntilSuffix(insertText, prefix, suffix, document.languageId)
    insertText = collapseDuplicativeWhitespace(prefix, insertText)

    // Trim start and end of the completion to remove all trailing whitespace.
    insertText = insertText.trimEnd()

    return { ...completion, insertText }
}

function getNodeTypesInfo(
    position: Position,
    parseTree?: Tree
): InlineCompletionItemWithAnalytics['nodeTypes'] | undefined {
    const positionBeforeCursor = asPoint({
        line: position.line,
        character: Math.max(0, position.character - 1),
    })

    if (parseTree) {
        const captures = getNodeAtCursorAndParents(parseTree.rootNode, positionBeforeCursor)

        if (captures.length > 0) {
            const [atCursor, ...parents] = captures

            return {
                atCursor: atCursor.node.type,
                parent: parents[0]?.node.type,
                grandparent: parents[1]?.node.type,
                greatGrandparent: parents[2]?.node.type,
            }
        }
    }

    return undefined
}

interface AdjustRangeToOverwriteOverlappingCharactersParams {
    position: Position
    currentLineSuffix: string
}

/**
 * Return a copy of item with an adjusted range to overwrite duplicative characters after the
 * completion on the first line.
 *
 * For example, with position `function sort(█)` and completion `array) {`, the range should be
 * adjusted to span the `)` so it is overwritten by the `insertText` (so that we don't end up with
 * the invalid `function sort(array) {)`).
 */
export function getRangeAdjustedForOverlappingCharacters(
    item: InlineCompletionItem,
    { position, currentLineSuffix }: AdjustRangeToOverwriteOverlappingCharactersParams
): InlineCompletionItem['range'] {
    // TODO(sqs): This is a very naive implementation that will not work for many cases. It always
    // just clobbers the rest of the line.

    if (!item.range && currentLineSuffix !== '') {
        return { start: position, end: position.translate(undefined, currentLineSuffix.length) }
    }

    return undefined
}

function rankCompletions(completions: ParsedCompletion[]): ParsedCompletion[] {
    return completions.sort((a, b) => {
        // Prioritize completions without parse errors
        if (a.parseErrorCount && !b.parseErrorCount) {
            return 1 // b comes first
        }
        if (!a.parseErrorCount && b.parseErrorCount) {
            return -1 // a comes first
        }

        // If both have or don't have parse errors, compare by insertText length
        return b.insertText.split('\n').length - a.insertText.split('\n').length
    })
}

function removeLowQualityCompletions(completions: InlineCompletionItem[]): InlineCompletionItem[] {
    return (
        completions
            // Filter out empty or single character completions.
            .filter(c => c.insertText.trim().length > 1)
    )
}
