import { Position, TextDocument } from 'vscode'

import { DocumentContext } from './get-current-doc-context'
import { parseAndTruncateCompletion } from './text-processing/parse-and-truncate-completion'
import { InlineCompletionItemWithAnalytics } from './text-processing/process-inline-completions'

export interface CanUsePartialCompletionParams {
    document: TextDocument
    position: Position
    docContext: DocumentContext
    multiline: boolean
}

/**
 * Evaluates a partial completion response and returns it when we can already use it. This is used
 * to terminate any streaming responses where we can get a token-by-token access to the result and
 * want to terminate as soon as stop conditions are triggered.
 *
 * Right now this handles two cases:
 *  1. When a single line completion is requested, it terminates after the first full line was
 *     received.
 *  2. For a multi-line completion, it terminates when the completion will be truncated based on the
 *     multi-line indentation logic.
 */
export function canUsePartialCompletion(
    partialResponse: string,
    params: CanUsePartialCompletionParams
): InlineCompletionItemWithAnalytics | null {
    const lastNewlineIndex = partialResponse.lastIndexOf('\n')

    // If there is no `\n` in the completion, we have not received a single full line yet
    if (lastNewlineIndex === -1) {
        return null
    }

    // The last line might not be complete yet, so we discard it
    const item = parseAndTruncateCompletion(partialResponse.slice(0, lastNewlineIndex), {
        ...params,
        // The tree-sitter-based truncation is disabled until the next-new-sibling approach is implemented.
        // See: https://github.com/sourcegraph/cody/issues/1402
        useTreeSitter: false,
    })

    if (params.multiline) {
        return (item.lineTruncatedCount || 0) > 0 ? item : null
    }

    return item.insertText.trim() === '' ? null : item
}
