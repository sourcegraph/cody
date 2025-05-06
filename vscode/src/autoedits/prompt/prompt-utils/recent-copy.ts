import { type AutocompleteContextSnippet, PromptString, ps } from '@sourcegraph/cody-shared'
import { RetrieverIdentifier } from '../../../completions/context/utils'
import * as constants from '../constants'
import {
    getContextItemsForIdentifier,
    getContextPromptWithPath,
    joinPromptsWithNewlineSeparator,
} from './common'

export function getRecentCopyPrompt(contextItems: AutocompleteContextSnippet[]): PromptString {
    const recentCopy = getContextItemsForIdentifier(
        contextItems,
        RetrieverIdentifier.RecentCopyRetriever
    )
    if (recentCopy.length === 0) {
        return ps``
    }
    const recentCopyPrompts = recentCopy.map(item =>
        getContextPromptWithPath(
            PromptString.fromDisplayPath(item.uri),
            PromptString.fromAutocompleteContextSnippet(item).content
        )
    )
    const recentCopyPrompt = joinPromptsWithNewlineSeparator(recentCopyPrompts, ps`\n\n`)
    return joinPromptsWithNewlineSeparator([
        constants.RECENT_COPY_TAG_OPEN,
        recentCopyPrompt,
        constants.RECENT_COPY_TAG_CLOSE,
    ])
}
