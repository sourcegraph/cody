import { type TextDocument } from 'vscode'

import { type DocumentContext } from './get-current-doc-context'
import { parseAndTruncateCompletion } from './text-processing/parse-and-truncate-completion'
import { type InlineCompletionItemWithAnalytics } from './text-processing/process-inline-completions'

interface CanUsePartialCompletionParams {
    document: TextDocument
    docContext: DocumentContext
    isDynamicMultilineCompletion?: boolean
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
    const { docContext } = params
    const lastNewlineIndex = partialResponse.lastIndexOf('\n')

    // If there is no `\n` in the completion, we have not received a single full line yet
    if (lastNewlineIndex === -1) {
        return null
    }

    const item = parseAndTruncateCompletion(partialResponse, params)

    if (docContext.multilineTrigger) {
        return (item.lineTruncatedCount || 0) > 0 ? item : null
    }

    return item.insertText.trim() === '' ? null : item
}
