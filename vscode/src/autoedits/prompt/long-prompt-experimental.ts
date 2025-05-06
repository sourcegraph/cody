import { type AutocompleteContextSnippet, PromptString, ps } from '@sourcegraph/cody-shared'
import { RetrieverIdentifier } from '../../completions/context/utils'

import { AutoeditsUserPromptStrategy, type UserPromptArgs } from './base'
import * as constants from './constants'
import {
    getContextItemMappingWithTokenLimit,
    getContextItemsForIdentifier,
    getPromptForTheContextSource,
    getPromptWithNewline,
    joinPromptsWithNewlineSeparator,
} from './prompt-utils/common'
import { getCurrentFileLongSuggestionPrompt } from './prompt-utils/current-file'
import { getLintErrorsPrompt } from './prompt-utils/lint'
import {
    getRecentEditsPrompt,
    groupConsecutiveRecentEditsItemsFromSameFile,
} from './prompt-utils/recent-edits'
import { getRecentlyViewedSnippetsPrompt } from './prompt-utils/recent-view'

export class LongTermPromptStrategy extends AutoeditsUserPromptStrategy {
    getUserPrompt({ context, tokenBudget, codeToReplaceData, document }: UserPromptArgs): PromptString {
        const contextItemMapping = getContextItemMappingWithTokenLimit(
            context,
            tokenBudget.contextSpecificTokenLimit,
            tokenBudget.contextSpecificNumItemsLimit
        )
        const recentViewsPrompt = getPromptForTheContextSource(
            contextItemMapping.get(RetrieverIdentifier.RecentViewPortRetriever) || [],
            constants.LONG_TERM_SNIPPET_VIEWS_INSTRUCTION,
            getRecentlyViewedSnippetsPrompt
        )
        const { shortTermEditsPrompt, longTermEditsPrompt } = this.getRecentEditsPrompt(
            contextItemMapping.get(RetrieverIdentifier.RecentEditsRetriever) || []
        )
        const lintErrorsPrompt = getPromptForTheContextSource(
            contextItemMapping.get(RetrieverIdentifier.DiagnosticsRetriever) || [],
            constants.LINT_ERRORS_INSTRUCTION,
            getLintErrorsPrompt
        )

        const filePromptWithMarkers = getCurrentFileLongSuggestionPrompt({
            document,
            codeToReplaceDataRaw: codeToReplaceData,
            includeCursor: true,
        })

        const currentFilePrompt = ps`${constants.CURRENT_FILE_INSTRUCTION}\n${filePromptWithMarkers}`

        const promptParts = [
            getPromptWithNewline(constants.LONG_SUGGESTION_BASE_USER_PROMPT),
            getPromptWithNewline(recentViewsPrompt),
            getPromptWithNewline(longTermEditsPrompt),
            getPromptWithNewline(currentFilePrompt),
            getPromptWithNewline(lintErrorsPrompt),
            getPromptWithNewline(shortTermEditsPrompt),
            constants.LONG_SUGGESTION_FINAL_USER_PROMPT,
        ]

        const finalPrompt = PromptString.join(promptParts, ps`\n`)
        return finalPrompt
    }

    public getRecentEditsPrompt(contextItems: AutocompleteContextSnippet[]): {
        shortTermEditsPrompt: PromptString
        longTermEditsPrompt: PromptString
    } {
        const recentEditsSnippets = getContextItemsForIdentifier(
            contextItems,
            RetrieverIdentifier.RecentEditsRetriever
        )

        const shortTermEditsPrompt =
            recentEditsSnippets.length > 0 ? ps`${getRecentEditsPrompt([recentEditsSnippets[0]])}` : ps``

        const longTermEditsPrompt =
            recentEditsSnippets.length > 1
                ? this.computeLongTermRecentEditsPrompt(recentEditsSnippets.slice(1))
                : ps``

        return {
            shortTermEditsPrompt,
            longTermEditsPrompt,
        }
    }

    private computeLongTermRecentEditsPrompt(contextItems: AutocompleteContextSnippet[]): PromptString {
        const combinedContextItems = groupConsecutiveRecentEditsItemsFromSameFile(contextItems)
        if (combinedContextItems.length === 0) {
            return ps``
        }
        return joinPromptsWithNewlineSeparator([
            constants.RECENT_EDITS_INSTRUCTION,
            getRecentEditsPrompt(combinedContextItems),
        ])
    }
}
