import { type AutocompleteContextSnippet, PromptString, ps } from '@sourcegraph/cody-shared'
import { RetrieverIdentifier } from '../../../completions/context/utils'
import * as constants from '../constants'
import { getContextItemsForIdentifier, joinPromptsWithNewlineSeparator } from './common'
import { getContextPromptWithPath } from './common'

export function getRecentlyViewedSnippetsPrompt(
    contextItems: AutocompleteContextSnippet[]
): PromptString {
    const recentViewedSnippets = getContextItemsForIdentifier(
        contextItems,
        RetrieverIdentifier.RecentViewPortRetriever
    )
    recentViewedSnippets.reverse()
    if (recentViewedSnippets.length === 0) {
        return ps``
    }
    const recentViewedSnippetPrompts = recentViewedSnippets.map(item =>
        joinPromptsWithNewlineSeparator([
            constants.SNIPPET_TAG_OPEN,
            getContextPromptWithPath(
                PromptString.fromDisplayPath(item.uri),
                PromptString.fromAutocompleteContextSnippet(item).content
            ),
            constants.SNIPPET_TAG_CLOSE,
        ])
    )

    const snippetsPrompt = joinPromptsWithNewlineSeparator(recentViewedSnippetPrompts)
    return joinPromptsWithNewlineSeparator([
        constants.RECENT_SNIPPET_VIEWS_TAG_OPEN,
        snippetsPrompt,
        constants.RECENT_SNIPPET_VIEWS_TAG_CLOSE,
    ])
}
