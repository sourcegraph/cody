import { isDefined } from '@sourcegraph/cody-shared/src/common'

import { DocumentContext } from './get-current-doc-context'
import {
    InlineCompletionsParams,
    InlineCompletionsResult,
    InlineCompletionsResultSource,
} from './get-inline-completions'
import { InlineCompletionItemWithAnalytics } from './text-processing/process-inline-completions'

type ReuseLastCandidateArgument =
    // required fields from InlineCompletionsParams
    Required<
        Pick<
            InlineCompletionsParams,
            'document' | 'position' | 'selectedCompletionInfo' | 'lastCandidate' | 'completeSuggestWidgetSelection'
        >
    > &
        // optional fields from InlineCompletionsParams
        Pick<InlineCompletionsParams, 'handleDidAcceptCompletionItem'> & { docContext: DocumentContext } // additional fields

/**
 * See test cases for the expected behaviors.
 */
export function reuseLastCandidate({
    document,
    position,
    selectedCompletionInfo,
    lastCandidate: { lastTriggerPosition, lastTriggerDocContext, lastTriggerSelectedInfoItem, ...lastCandidate },
    docContext: { currentLinePrefix, currentLineSuffix, nextNonEmptyLine },
    completeSuggestWidgetSelection,
    handleDidAcceptCompletionItem,
}: ReuseLastCandidateArgument): InlineCompletionsResult | null {
    const isSameDocument = lastCandidate.uri.toString() === document.uri.toString()
    const isSameLine = lastTriggerPosition.line === position.line
    const isSameNextNonEmptyLine = lastTriggerDocContext.nextNonEmptyLine === nextNonEmptyLine

    // If completeSuggestWidgetSelection is enabled, we have to compare that a last candidate is
    // only reused if it is has same completion info selected.
    const isSameTriggerSelectedInfoItem = completeSuggestWidgetSelection
        ? lastTriggerSelectedInfoItem === selectedCompletionInfo?.text
        : true

    if (!isSameDocument || !isSameLine || !isSameNextNonEmptyLine || !isSameTriggerSelectedInfoItem) {
        return null
    }

    // There are 2 reasons we can reuse a candidate: typing-as-suggested or change-of-indentation.
    const lastTriggerCurrentLinePrefix = lastTriggerDocContext.currentLinePrefix
    const isIndentation = isWhitespace(currentLinePrefix) && currentLinePrefix.startsWith(lastTriggerCurrentLinePrefix)
    const isDeindentation =
        isWhitespace(lastTriggerCurrentLinePrefix) && lastTriggerCurrentLinePrefix.startsWith(currentLinePrefix)
    const isIndentationChange = currentLineSuffix === '' && (isIndentation || isDeindentation)
    let didAcceptCompletion = false

    const itemsToReuse = lastCandidate.result.items
        .map((item): InlineCompletionItemWithAnalytics | undefined => {
            // Allow reuse if the user is (possibly) typing forward as suggested by the last
            // candidate completion. We still need to filter the candidate items to see which ones
            // the user's typing actually follows.
            const lastCompletion = lastTriggerCurrentLinePrefix + item.insertText
            const isTypingAsSuggested =
                lastCompletion.startsWith(currentLinePrefix) && position.isAfterOrEqual(lastTriggerPosition)
            if (isTypingAsSuggested) {
                const remaining = lastCompletion.slice(currentLinePrefix.length)

                // When the remaining text is empty, the user has forward-typed the full text of the
                // completion. We mark this as an accepted completion.
                if (remaining.length === 0) {
                    didAcceptCompletion = true
                    handleDidAcceptCompletionItem?.(lastCandidate.result.logId, item)
                    return undefined
                }
                // TODO: Handle partial acceptance heres
                return { insertText: remaining }
            }

            // Allow reuse if only the indentation (leading whitespace) has changed.
            if (isIndentationChange) {
                return { insertText: lastTriggerCurrentLinePrefix.slice(currentLinePrefix.length) + item.insertText }
            }

            return undefined
        })
        .filter(isDefined)

    // Ensure that when one completion was marked as accepted, we don't reuse any others
    if (didAcceptCompletion) {
        return null
    }

    return itemsToReuse.length > 0
        ? {
              // Reuse the logId to so that typing text of a displayed completion will not log a new
              // completion on every keystroke.
              logId: lastCandidate.result.logId,

              source: InlineCompletionsResultSource.LastCandidate,
              items: itemsToReuse,
          }
        : null
}

function isWhitespace(s: string): boolean {
    return /^\s*$/.test(s)
}
