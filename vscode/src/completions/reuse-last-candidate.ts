import { isDefined } from '@sourcegraph/cody-shared/src/common'

import { DocumentContext } from './get-current-doc-context'
import {
    InlineCompletionsParams,
    InlineCompletionsResult,
    InlineCompletionsResultSource,
} from './get-inline-completions'
import { InlineCompletionItem } from './types'

/**
 * See test cases for the expected behaviors.
 */
export function reuseLastCandidate({
    document,
    position,
    selectedCompletionInfo,
    lastCandidate: {
        lastTriggerPosition,
        lastTriggerCurrentLinePrefix,
        lastTriggerNextNonEmptyLine,
        lastTriggerSelectedInfoItem,
        ...lastCandidate
    },
    docContext: { currentLinePrefix, currentLineSuffix, nextNonEmptyLine },
    completeSuggestWidgetSelection,
}: Required<
    Pick<
        InlineCompletionsParams,
        'document' | 'position' | 'selectedCompletionInfo' | 'lastCandidate' | 'completeSuggestWidgetSelection'
    >
> & {
    docContext: DocumentContext
}): InlineCompletionsResult | null {
    const isSameDocument = lastCandidate.uri.toString() === document.uri.toString()
    const isSameLine = lastTriggerPosition.line === position.line
    const isSameNextNonEmptyLine = lastTriggerNextNonEmptyLine === nextNonEmptyLine

    // If completeSuggestWidgetSelection is enabled, we have to compare that a last candidate is
    // only reused if it is has same completion info selected.
    const isSameTriggerSelectedInfoItem = completeSuggestWidgetSelection
        ? lastTriggerSelectedInfoItem === selectedCompletionInfo?.text
        : true

    if (!isSameDocument || !isSameLine || !isSameNextNonEmptyLine || !isSameTriggerSelectedInfoItem) {
        return null
    }

    // There are 2 reasons we can reuse a candidate: typing-as-suggested or change-of-indentation.

    const isIndentation = isWhitespace(currentLinePrefix) && currentLinePrefix.startsWith(lastTriggerCurrentLinePrefix)
    const isDeindentation =
        isWhitespace(lastTriggerCurrentLinePrefix) && lastTriggerCurrentLinePrefix.startsWith(currentLinePrefix)
    const isIndentationChange = currentLineSuffix === '' && (isIndentation || isDeindentation)

    const itemsToReuse = lastCandidate.result.items
        .map((item): InlineCompletionItem | undefined => {
            // Allow reuse if the user is (possibly) typing forward as suggested by the last
            // candidate completion. We still need to filter the candidate items to see which ones
            // the user's typing actually follows.
            const lastCompletion = lastTriggerCurrentLinePrefix + item.insertText
            const isTypingAsSuggested =
                lastCompletion.startsWith(currentLinePrefix) && position.isAfterOrEqual(lastTriggerPosition)
            if (isTypingAsSuggested) {
                return { insertText: lastCompletion.slice(currentLinePrefix.length) }
            }

            // Allow reuse if only the indentation (leading whitespace) has changed.
            if (isIndentationChange) {
                return { insertText: lastTriggerCurrentLinePrefix.slice(currentLinePrefix.length) + item.insertText }
            }

            return undefined
        })
        .filter(isDefined)

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
