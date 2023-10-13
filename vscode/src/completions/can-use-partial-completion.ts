import { DocumentContext } from './get-current-doc-context'
import { trimUntilSuffix } from './text-processing'
import { truncateMultilineCompletion } from './text-processing/truncate-multiline-completion'

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
    // return false
    const lastNlIndex = partialResponse.lastIndexOf('\n')

    // If there is no `\n` in the completion, we have not received a single full line yet
    if (lastNlIndex === -1) {
        return false
    }

    // The last line might not be complete yet, so we discard it
    const completion = partialResponse.slice(0, lastNlIndex)

    if (multiline) {
        // `truncateMultilineCompletion` removes the leading new line in some cases
        // so we explicitly check if lines the end of the completions were deleted.
        const { truncatedEnd, text: withTruncatedBlock } = truncateMultilineCompletion(
            completion,
            prefix,
            suffix,
            document.languageId
        )

        const withTruncatedSuffix = trimUntilSuffix(withTruncatedBlock, prefix, suffix, document.languageId)

        return truncatedEnd || withTruncatedSuffix.split('\n').length < withTruncatedBlock.split('\n').length
    }

    const isNonEmptyLine = completion.trim() !== ''
    return isNonEmptyLine
}
