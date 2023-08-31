import { DocumentContext } from './get-current-doc-context'
import { truncateMultilineCompletion } from './multiline'
import { trimUntilSuffix } from './text-processing'

interface CanUsePartialCompletionParams {
    document: { languageId: string }
    multiline: boolean
    docContext: DocumentContext
}

/**
 * Evaluates a partial completion response and returns true when we can already use it. This is used
 * to terminate any streaming responses where we can get a token-by-token access to the result and
 * want to terminate as soon as stop conditions are triggered.
 *
 * Right now this handles two cases:
 *  1. When a single line completion is requested, it terminates after the first full line was
 *     received.
 *  2. For a multi-line completion, it terminates when the completion will be truncated based on the
 *     multi-line indentation logic or an eventual match with a line already in the editor.
 */
export function canUsePartialCompletion(
    partialResponse: string,
    { document, multiline, docContext: { prefix, suffix } }: CanUsePartialCompletionParams
): boolean {
    const lastNlIndex = partialResponse.lastIndexOf('\n')

    // If there is no `\n` in the completion, we have not received a single full line yet
    if (lastNlIndex === -1) {
        return false
    }

    // The last line might not be complete yet, so we discard it
    const completion = partialResponse.slice(0, lastNlIndex)

    if (multiline) {
        let truncated = truncateMultilineCompletion(completion, prefix, suffix, document.languageId)
        truncated = trimUntilSuffix(truncated, prefix, suffix, document.languageId)

        return truncated.split('\n').length < completion.split('\n').length
    }

    const isNonEmptyLine = completion.trim() !== ''
    return isNonEmptyLine
}
