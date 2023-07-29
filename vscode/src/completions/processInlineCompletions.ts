import type { TextDocument } from 'vscode'

import { getCurrentDocContext } from './document'
import { truncateMultilineCompletion } from './multiline'
import { collapseDuplicativeWhitespace, trimUntilSuffix } from './text-processing'
import { InlineCompletionItem } from './types'

export interface ProcessInlineCompletionsParams {
    document: Pick<TextDocument, 'languageId'>
    multiline: boolean
    docContext: NonNullable<ReturnType<typeof getCurrentDocContext>>
}

/**
 * This function implements post-processing logic that is applied regardless of
 * which provider is chosen.
 */
export function processInlineCompletions(
    items: InlineCompletionItem[],
    { document, multiline, docContext }: ProcessInlineCompletionsParams
): InlineCompletionItem[] {
    // Shared post-processing logic
    const processedCompletions = items.map(item => processItem(item, { document, multiline, docContext }))

    // Filter results
    const visibleResults = filterCompletions(processedCompletions)

    // Remove duplicate results
    const uniqueResults = [...new Map(visibleResults.map(item => [item.insertText, item])).values()]

    // Rank results
    const rankedResults = rankCompletions(uniqueResults)

    return rankedResults
}

function processItem(
    item: InlineCompletionItem,
    {
        document: { languageId },
        multiline,
        docContext: { prefix, suffix },
    }: Pick<ProcessInlineCompletionsParams, 'document' | 'multiline' | 'docContext'>
): InlineCompletionItem {
    // Make a copy to avoid unexpected behavior.
    item = { ...item }

    if (typeof item.insertText !== 'string') {
        throw new TypeError('SnippetText not supported')
    }

    if (multiline) {
        item.insertText = truncateMultilineCompletion(item.insertText, prefix, suffix, languageId)
    }
    item.insertText = trimUntilSuffix(item.insertText, prefix, suffix, languageId)
    item.insertText = collapseDuplicativeWhitespace(prefix, item.insertText)

    return item
}

function rankCompletions(completions: InlineCompletionItem[]): InlineCompletionItem[] {
    // TODO(philipp-spiess): Improve ranking to something more complex then just length
    return completions.sort((a, b) => b.insertText.split('\n').length - a.insertText.split('\n').length)
}

function filterCompletions(completions: InlineCompletionItem[]): InlineCompletionItem[] {
    return completions.filter(c => c.insertText.trim() !== '')
}
