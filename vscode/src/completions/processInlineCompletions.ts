import type { Position, TextDocument } from 'vscode'

import { DocumentContext } from './document'
import { truncateMultilineCompletion } from './multiline'
import { collapseDuplicativeWhitespace, removeTrailingWhitespace, trimUntilSuffix } from './text-processing'
import { InlineCompletionItem } from './types'

export interface ProcessInlineCompletionsParams {
    document: Pick<TextDocument, 'languageId'>
    position: Position
    multiline: boolean
    docContext: DocumentContext
}

/**
 * This function implements post-processing logic that is applied regardless of
 * which provider is chosen.
 */
export function processInlineCompletions(
    items: InlineCompletionItem[],
    { document, position, multiline, docContext }: ProcessInlineCompletionsParams
): InlineCompletionItem[] {
    // Shared post-processing logic
    const processedCompletions = items.map(item => processItem(item, { document, position, multiline, docContext }))

    // Filter results
    const visibleResults = filterCompletions(processedCompletions)

    // Remove duplicate results
    const uniqueResults = [...new Map(visibleResults.map(item => [item.insertText, item])).values()]

    // Rank results
    const rankedResults = rankCompletions(uniqueResults)

    return rankedResults
}

export function processItem(
    item: InlineCompletionItem,
    {
        document,
        position,
        multiline,
        docContext: { prefix, suffix, currentLineSuffix },
    }: Pick<ProcessInlineCompletionsParams, 'document' | 'position' | 'multiline' | 'docContext'>
): InlineCompletionItem {
    // Make a copy to avoid unexpected behavior.
    item = { ...item }

    if (typeof item.insertText !== 'string') {
        throw new TypeError('SnippetText not supported')
    }

    item = adjustRangeToOverwriteOverlappingCharacters(item, { position, docContext: { currentLineSuffix } })
    if (multiline) {
        item.insertText = truncateMultilineCompletion(item.insertText, prefix, suffix, document.languageId)
        item.insertText = removeTrailingWhitespace(item.insertText)
    }

    if (!multiline) {
        // Only keep a single line in single-line completions mode
        const indexOfNl = item.insertText.indexOf('\n')
        if (indexOfNl !== -1) {
            item.insertText = item.insertText.slice(0, indexOfNl + 1)
        }
    }

    item.insertText = trimUntilSuffix(item.insertText, prefix, suffix, document.languageId)
    item.insertText = collapseDuplicativeWhitespace(prefix, item.insertText)

    return item
}

/**
 * Return a copy of item with an adjusted range to overwrite duplicative characters after the
 * completion on the first line.
 *
 * For example, with position `function sort(█)` and completion `array) {`, the range should be
 * adjusted to span the `)` so it is overwritten by the `insertText` (so that we don't end up with
 * the invalid `function sort(array) {)`).
 */
export function adjustRangeToOverwriteOverlappingCharacters(
    item: InlineCompletionItem,
    {
        position,
        docContext: { currentLineSuffix },
    }: Pick<ProcessInlineCompletionsParams, 'position'> & {
        docContext: Pick<DocumentContext, 'currentLineSuffix'>
    }
): InlineCompletionItem {
    // TODO(sqs): This is a very naive implementation that will not work for many cases. It always
    // just clobbers the rest of the line.

    if (!item.range && currentLineSuffix !== '') {
        return { ...item, range: { start: position, end: position.translate(undefined, currentLineSuffix.length) } }
    }

    return item
}

function rankCompletions(completions: InlineCompletionItem[]): InlineCompletionItem[] {
    // TODO(philipp-spiess): Improve ranking to something more complex then just length
    return completions.sort((a, b) => b.insertText.split('\n').length - a.insertText.split('\n').length)
}

function filterCompletions(completions: InlineCompletionItem[]): InlineCompletionItem[] {
    return completions.filter(c => c.insertText.trim() !== '')
}
