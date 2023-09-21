import { Position, TextDocument } from 'vscode'

import { dedupeWith } from '@sourcegraph/cody-shared/src/common'

import { DocumentContext } from '../get-current-doc-context'
import { getDocumentQuerySDK } from '../tree-sitter/queries'
import { InlineCompletionItem } from '../types'

import { parseCompletion, ParsedCompletion, parsedCompletionToCompletion } from './parse-completion'
import { truncateMultilineCompletion } from './truncate-multiline-completion'
import { truncateParsedCompletion } from './truncate-parsed-completion'
import { collapseDuplicativeWhitespace, removeTrailingWhitespace, trimUntilSuffix } from './utils'

export interface ProcessInlineCompletionsParams {
    document: TextDocument
    position: Position
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
    const processedCompletions = items.map(item => processItem({ ...params, completion: item }))

    // Remove low quality results
    const visibleResults = removeLowQualityCompletions(processedCompletions)

    // Remove duplicate results
    const uniqueResults = dedupeWith(visibleResults, 'insertText')

    // Rank results
    const rankedResults = rankCompletions(uniqueResults)

    return rankedResults
}

interface ProcessItemParams {
    completion: InlineCompletionItem
    document: TextDocument
    position: Position
    docContext: DocumentContext
}

export function processItem(params: ProcessItemParams): ParsedCompletion {
    const { document, position, docContext } = params
    const { prefix, suffix, currentLineSuffix, multilineTrigger } = docContext

    // Make a copy to avoid unexpected behavior.
    let completion = { ...params.completion }

    if (typeof completion.insertText !== 'string') {
        throw new TypeError('SnippetText not supported')
    }

    if (completion.insertText.length === 0) {
        return completion
    }

    completion = adjustRangeToOverwriteOverlappingCharacters(completion, { position, currentLineSuffix })
    const parsed = parseCompletion({ completion, document, position, docContext })
    let { insertText } = parsed

    if (multilineTrigger) {
        // Use tree-sitter for truncation if `config.autocompleteExperimentalSyntacticPostProcessing` is enabled.
        if (parsed.tree && getDocumentQuerySDK(document.languageId)) {
            insertText = truncateParsedCompletion({ completion: parsed, document })
        } else {
            insertText = truncateMultilineCompletion(insertText, prefix, suffix, document.languageId)
        }

        insertText = removeTrailingWhitespace(insertText)
    }

    if (!multilineTrigger) {
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

    return { ...parsed, insertText }
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

function removeLowQualityCompletions(completions: InlineCompletionItem[]): InlineCompletionItem[] {
    return (
        completions
            // Filter out empty or single character completions.
            .filter(c => c.insertText.trim().length > 1)
    )
}
