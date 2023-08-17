import { truncateMultilineCompletion } from './multiline'
import { ProcessInlineCompletionsParams } from './processInlineCompletions'

/**
 * Evaluates a partial completion response and returns true when we can already use it. This is used
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
    {
        document,
        multiline,
        docContext: { prefix, suffix },
    }: Pick<ProcessInlineCompletionsParams, 'document' | 'multiline' | 'docContext'>
): boolean {
    const lastNlIndex = partialResponse.lastIndexOf('\n')

    // If there is no `\n` in the completion, we have not received a single full line yet
    if (lastNlIndex === -1) {
        return false
    }

    // The last line might not be complete yet, so we discard it
    const completion = partialResponse.slice(0, lastNlIndex)

    if (multiline) {
        const truncated = truncateMultilineCompletion(completion, prefix, suffix, document.languageId)
        return truncated.split('\n').length < completion.split('\n').length
    }

    const isNonEmptyLine = completion.trim() !== ''
    return isNonEmptyLine
}
