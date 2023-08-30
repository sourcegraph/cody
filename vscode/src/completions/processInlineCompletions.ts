import { Position, Range, TextDocument } from 'vscode'

import { dedupeWith } from '@sourcegraph/cody-shared'

import { DocumentContext } from './get-current-doc-context'
import { truncateMultilineCompletion } from './multiline'
import { collapseDuplicativeWhitespace, removeTrailingWhitespace, trimUntilSuffix } from './text-processing'
import { asPoint, getCachedParseTreeForDocument } from './tree-sitter/parse-tree-cache'
import { InlineCompletionItem } from './types'

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
    { document, position, multiline, docContext }: ProcessInlineCompletionsParams
): InlineCompletionItem[] {
    // Shared post-processing logic
    const processedCompletions = items.map(item => processItem(item, { document, position, multiline, docContext }))

    // Remove empty results
    const visibleResults = removeEmptyCompletions(processedCompletions)

    // Remove duplicate results
    const uniqueResults = dedupeWith(visibleResults, 'insertText')

    // Add parse errors info to completions
    // Does nothing if `cody.autocomplete.experimental.syntacticPostProcessing` is not enabled.
    // TODO: add explicit configuration check here when it's possible to avoid prop-drilling for config values.
    const withParseInfo = addParseInfoToCompletions(uniqueResults, { document, position, docContext })

    // Rank results
    const rankedResults = rankCompletions(withParseInfo)

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

    // Trim start and end of the completion to remove all trailing whitespace.
    item.insertText = item.insertText.trimEnd()

    return item
}

interface AdjustRangeToOverwriteOverlappingCharactersParams {
    position: Position
    docContext: Pick<DocumentContext, 'currentLineSuffix'>
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
    { position, docContext: { currentLineSuffix } }: AdjustRangeToOverwriteOverlappingCharactersParams
): InlineCompletionItem {
    // TODO(sqs): This is a very naive implementation that will not work for many cases. It always
    // just clobbers the rest of the line.

    if (!item.range && currentLineSuffix !== '') {
        return { ...item, range: { start: position, end: position.translate(undefined, currentLineSuffix.length) } }
    }

    return item
}

interface CompletionWithParseInfo extends InlineCompletionItem {
    hasParseErrors: boolean
}

export function addParseInfoToCompletions(
    items: InlineCompletionItem[],
    { document, position, docContext }: Omit<ProcessInlineCompletionsParams, 'multiline'>
): CompletionWithParseInfo[] {
    const parseTreeCache = getCachedParseTreeForDocument(document)

    // Do nothig if the syntactic post-processing is not enabled.
    if (!parseTreeCache) {
        return items.map(item => ({ ...item, hasParseErrors: false }))
    }

    const { parser, tree } = parseTreeCache
    const query = parser.getLanguage().query('(ERROR) @error')

    return items.map(completion => {
        const { range, insertText } = completion
        const treeCopy = tree.copy()

        // Adjust suffix and prefix based on completion insert range.
        const prefix = range
            ? document.getText(new Range(new Position(0, 0), range.start as Position))
            : docContext.prefix
        const suffix = range
            ? document.getText(new Range(range.end as Position, document.positionAt(document.getText().length)))
            : docContext.suffix

        const textWithCompletion = prefix + insertText + suffix
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
        const treeWithCompletion = parser.parse(textWithCompletion, treeCopy)

        // Search for ERROR nodes in the completion range.
        const matches = query.matches(
            treeWithCompletion.rootNode,
            {
                row: position.line,
                column: position.character,
            },
            {
                row: completionEndPosition.line,
                column: completionEndPosition.character,
            }
        )

        return {
            ...completion,
            hasParseErrors: matches.length > 0,
        }
    })
}

function rankCompletions(completions: CompletionWithParseInfo[]): InlineCompletionItem[] {
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
        .map(({ hasParseErrors, ...rest }) => rest)
}

function removeEmptyCompletions(completions: InlineCompletionItem[]): InlineCompletionItem[] {
    return completions.filter(c => c.insertText.trim() !== '')
}
