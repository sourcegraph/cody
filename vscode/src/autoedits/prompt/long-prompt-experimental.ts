import { type AutocompleteContextSnippet, PromptString, ps } from '@sourcegraph/cody-shared'
import { RetrieverIdentifier } from '../../completions/context/utils'

import { AutoeditsUserPromptStrategy, type UserPromptArgs } from './base'
import * as constants from './constants'
import {
    getContextItemMappingWithTokenLimit,
    getPromptForTheContextSource,
    getPromptWithNewline,
    joinPromptsWithNewlineSeparator,
} from './prompt-utils/common'
import { getCurrentFileLongSuggestionPrompt } from './prompt-utils/current-file'
import { getLintErrorsPrompt } from './prompt-utils/lint'
import {
    getRecentEditsPrompt,
    groupConsecutiveRecentEditsItemsFromSameFile,
    splitMostRecentRecentEditItemAsShortTermItem,
} from './prompt-utils/recent-edits'
import { getRecentSnippetViewPromptWithMaxSnippetAge } from './prompt-utils/recent-view'

export class LongTermPromptStrategy extends AutoeditsUserPromptStrategy {
    // Oldest timestamp for a snippet view that can be included in the prompt.
    private SNIPPET_VIEW_MAX_TIMESTAMP_MS = 1000 * 60 * 10 // 10 minutes

    getUserPrompt({ context, tokenBudget, codeToReplaceData, document }: UserPromptArgs): PromptString {
        const contextItemMapping = getContextItemMappingWithTokenLimit(
            context,
            tokenBudget.contextSpecificTokenLimit,
            tokenBudget.contextSpecificNumItemsLimit
        )
        const recentViewsPrompt = getRecentSnippetViewPromptWithMaxSnippetAge(
            contextItemMapping.get(RetrieverIdentifier.RecentViewPortRetriever) || [],
            this.SNIPPET_VIEW_MAX_TIMESTAMP_MS
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
        const { shortTermEditItems, longTermEditItems } =
            splitMostRecentRecentEditItemAsShortTermItem(contextItems)
        const shortTermEditsPrompt = getRecentEditsPrompt(shortTermEditItems)
        const longTermEditsPrompt = this.computeLongTermRecentEditsPrompt(longTermEditItems)

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
