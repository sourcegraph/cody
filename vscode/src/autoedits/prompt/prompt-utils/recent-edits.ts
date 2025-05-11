import { type AutocompleteContextSnippet, PromptString, ps } from '@sourcegraph/cody-shared'
import { groupConsecutiveItemsByPredicate } from '../../../completions/context/retrievers/recent-user-actions/recent-edits-diff-helpers/utils'
import { RetrieverIdentifier } from '../../../completions/context/utils'
import * as constants from '../constants'
import { getContextItemsForIdentifier, joinPromptsWithNewlineSeparator } from './common'

export function getRecentEditsPrompt(contextItems: AutocompleteContextSnippet[]): PromptString {
    const recentEdits = getContextItemsForIdentifier(
        contextItems,
        RetrieverIdentifier.RecentEditsRetriever
    )
    recentEdits.reverse()
    if (recentEdits.length === 0) {
        return ps``
    }
    const recentEditsPrompts = recentEdits.map(item =>
        getRecentEditsContextPromptWithPath(
            PromptString.fromDisplayPath(item.uri),
            PromptString.fromAutocompleteContextSnippet(item).content
        )
    )
    const recentEditsPrompt = joinPromptsWithNewlineSeparator(recentEditsPrompts)
    return joinPromptsWithNewlineSeparator([
        constants.RECENT_EDITS_TAG_OPEN,
        recentEditsPrompt,
        constants.RECENT_EDITS_TAG_CLOSE,
    ])
}

export function groupConsecutiveRecentEditsItemsFromSameFile(
    contextItems: AutocompleteContextSnippet[]
): AutocompleteContextSnippet[] {
    if (contextItems.length === 0) {
        return []
    }
    // Group consecutive items by file name
    const groupedContextItems = groupConsecutiveItemsByPredicate(
        contextItems,
        (a, b) => a.uri.toString() === b.uri.toString()
    )
    const combinedContextItems: AutocompleteContextSnippet[] = []
    for (const group of groupedContextItems) {
        const combinedItem = {
            ...group[0],
            // The group content is from the latest to the oldest item.
            // We need to reverse the order of the content to get diff from old to new.
            content: group
                .map(item => item.content)
                .reverse()
                .join('\nthen\n'),
        }
        combinedContextItems.push(combinedItem)
    }
    return combinedContextItems
}

export function getRecentEditsContextPromptWithPath(
    filePath: PromptString,
    content: PromptString
): PromptString {
    return ps`${filePath}\n${content}`
}
