import { Position, TextDocument } from 'vscode'

import { dedupeWith } from '@sourcegraph/cody-shared/src/common'

import { DocumentContext } from '../get-current-doc-context'
import { InlineCompletionItem } from '../types'

import { parseCompletion, ParsedCompletion, parsedCompletionToCompletion } from './parse-completion'
import { truncateMultilineCompletion } from './truncate-multiline-completion'
import { collapseDuplicativeWhitespace, removeTrailingWhitespace, trimUntilSuffix } from './utils'

export interface ProcessInlineCompletionsParams {
    document: TextDocument
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
    params: ProcessInlineCompletionsParams
): InlineCompletionItem[] {
    // Shared post-processing logic
    const processedCompletions = items.map(item => processItem(item, params))

    // Remove empty results
    const visibleResults = removeEmptyCompletions(processedCompletions)

    // Remove duplicate results
    const uniqueResults = dedupeWith(visibleResults, 'insertText')

    // Rank results
    const rankedResults = rankCompletions(uniqueResults)

    return rankedResults
}

export function processItem(
    completion: InlineCompletionItem,
    params: ProcessInlineCompletionsParams
): ParsedCompletion {
    const { document, position, multiline, docContext } = params
    const { prefix, suffix, currentLineSuffix } = docContext

    // Make a copy to avoid unexpected behavior.
    completion = { ...completion }

    if (typeof completion.insertText !== 'string') {
        throw new TypeError('SnippetText not supported')
    }

    completion = adjustRangeToOverwriteOverlappingCharacters(completion, { position, currentLineSuffix })
    const parsed = parseCompletion({ completion, document, position, docContext })

    if (multiline) {
        parsed.insertText = truncateMultilineCompletion(parsed.insertText, prefix, suffix, document.languageId)
        parsed.insertText = removeTrailingWhitespace(parsed.insertText)
    }

    if (!multiline) {
        // Only keep a single line in single-line completions mode
        const newLineIndex = parsed.insertText.indexOf('\n')
        if (newLineIndex !== -1) {
            parsed.insertText = parsed.insertText.slice(0, newLineIndex + 1)
        }
    }

    parsed.insertText = trimUntilSuffix(parsed.insertText, prefix, suffix, document.languageId)
    parsed.insertText = collapseDuplicativeWhitespace(prefix, parsed.insertText)

    // Trim start and end of the completion to remove all trailing whitespace.
    parsed.insertText = parsed.insertText.trimEnd()

    return parsed
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
export function adjustRangeToOverwriteOverlappingCharacters(
    item: InlineCompletionItem,
    { position, currentLineSuffix }: AdjustRangeToOverwriteOverlappingCharactersParams
): InlineCompletionItem {
    // TODO(sqs): This is a very naive implementation that will not work for many cases. It always
    // just clobbers the rest of the line.

    if (!item.range && currentLineSuffix !== '') {
        return { ...item, range: { start: position, end: position.translate(undefined, currentLineSuffix.length) } }
    }

    return item
}

function rankCompletions(completions: ParsedCompletion[]): InlineCompletionItem[] {
    return completions
        .sort((a, b) => {
            // Prioritize completions without parse errors
            if (a.hasParseErrors && !b.hasParseErrors) {
                return 1 // b comes first
            }
            if (!a.hasParseErrors && b.hasParseErrors) {
                return -1 // a comes first
            }

            // If both have or don't have parse errors, compare by insertText length
            return b.insertText.split('\n').length - a.insertText.split('\n').length
        })
        .map(parsedCompletionToCompletion)
}

function removeEmptyCompletions(completions: InlineCompletionItem[]): InlineCompletionItem[] {
    return completions.filter(c => c.insertText.trim() !== '')
}
