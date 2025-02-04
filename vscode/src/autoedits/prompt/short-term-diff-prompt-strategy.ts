import { type AutocompleteContextSnippet, type PromptString, ps } from '@sourcegraph/cody-shared'

import { groupConsecutiveItemsByPredicate } from '../../completions/context/retrievers/recent-user-actions/recent-edits-diff-helpers/utils'
import { RetrieverIdentifier } from '../../completions/context/utils'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'

import { shortenPromptForOutputChannel } from '../../../src/completions/output-channel-logger'
import { AutoeditsUserPromptStrategy, type UserPromptArgs } from './base'
import * as constants from './constants'
import {
    getContextItemMappingWithTokenLimit,
    getContextItemsForIdentifier,
    getCurrentFilePromptComponents,
    getJaccardSimilarityPrompt,
    getLintErrorsPrompt,
    getPromptForTheContextSource,
    getPromptWithNewline,
    getRecentCopyPrompt,
    getRecentEditsPrompt,
    getRecentlyViewedSnippetsPrompt,
    getRulesPrompt,
    joinPromptsWithNewlineSeparator,
} from './prompt-utils'

export class ShortTermPromptStrategy extends AutoeditsUserPromptStrategy {
    private readonly SHORT_TERM_SNIPPET_VIEW_TIME_MS = 60 * 1000 // 1 minute

    getUserPrompt({ context, tokenBudget, codeToReplaceData, document }: UserPromptArgs): PromptString {
        const contextItemMapping = getContextItemMappingWithTokenLimit(
            context,
            tokenBudget.contextSpecificTokenLimit
        )

        const rulesPrompt = getPromptForTheContextSource(
            contextItemMapping.get(RetrieverIdentifier.RulesRetriever) || [],
            constants.RULES_INSTRUCTION,
            getRulesPrompt
        )

        const { shortTermViewPrompt, longTermViewPrompt } = this.getRecentSnippetViewPrompt(
            contextItemMapping.get(RetrieverIdentifier.RecentViewPortRetriever) || []
        )
        const { shortTermEditsPrompt, longTermEditsPrompt } = this.getRecentEditsPrompt(
            contextItemMapping.get(RetrieverIdentifier.RecentEditsRetriever) || []
        )
        const lintErrorsPrompt = getPromptForTheContextSource(
            contextItemMapping.get(RetrieverIdentifier.DiagnosticsRetriever) || [],
            constants.LINT_ERRORS_INSTRUCTION,
            getLintErrorsPrompt
        )

        const recentCopyPrompt = getPromptForTheContextSource(
            contextItemMapping.get(RetrieverIdentifier.RecentCopyRetriever) || [],
            constants.RECENT_COPY_INSTRUCTION,
            getRecentCopyPrompt
        )

        const jaccardSimilarityPrompt = getPromptForTheContextSource(
            contextItemMapping.get(RetrieverIdentifier.JaccardSimilarityRetriever) || [],
            constants.JACCARD_SIMILARITY_INSTRUCTION,
            getJaccardSimilarityPrompt
        )

        const { fileWithMarkerPrompt, areaPrompt } = getCurrentFilePromptComponents(
            document,
            codeToReplaceData
        )

        const currentFilePrompt = ps`${constants.CURRENT_FILE_INSTRUCTION}${fileWithMarkerPrompt}`

        const finalPrompt = joinPromptsWithNewlineSeparator(
            getPromptWithNewline(constants.BASE_USER_PROMPT),
            getPromptWithNewline(rulesPrompt),
            getPromptWithNewline(jaccardSimilarityPrompt),
            getPromptWithNewline(longTermViewPrompt),
            getPromptWithNewline(currentFilePrompt),
            getPromptWithNewline(shortTermViewPrompt),
            getPromptWithNewline(longTermEditsPrompt),
            getPromptWithNewline(lintErrorsPrompt),
            getPromptWithNewline(recentCopyPrompt),
            getPromptWithNewline(areaPrompt),
            getPromptWithNewline(shortTermEditsPrompt),
            constants.FINAL_USER_PROMPT
        )

        autoeditsOutputChannelLogger.logDebugIfVerbose('ShortTermPromptStrategy', 'getUserPrompt', {
            verbose: shortenPromptForOutputChannel(finalPrompt.toString(), []),
        })
        return finalPrompt
    }

    public getRecentSnippetViewPrompt(contextItems: AutocompleteContextSnippet[]): {
        shortTermViewPrompt: PromptString
        longTermViewPrompt: PromptString
    } {
        const recentViewedSnippets = getContextItemsForIdentifier(
            contextItems,
            RetrieverIdentifier.RecentViewPortRetriever
        )

        const shortTermViewedSnippets: AutocompleteContextSnippet[] = []
        const longTermViewedSnippets: AutocompleteContextSnippet[] = []
        for (const item of recentViewedSnippets) {
            if (
                item.metadata?.timeSinceActionMs !== undefined &&
                item.metadata.timeSinceActionMs < this.SHORT_TERM_SNIPPET_VIEW_TIME_MS
            ) {
                shortTermViewedSnippets.push(item)
            } else {
                longTermViewedSnippets.push(item)
            }
        }

        const shortTermViewPrompt =
            shortTermViewedSnippets.length > 0
                ? joinPromptsWithNewlineSeparator(
                      constants.SHORT_TERM_SNIPPET_VIEWS_INSTRUCTION,
                      getRecentlyViewedSnippetsPrompt(shortTermViewedSnippets)
                  )
                : ps``

        const longTermViewPrompt =
            longTermViewedSnippets.length > 0
                ? joinPromptsWithNewlineSeparator(
                      constants.LONG_TERM_SNIPPET_VIEWS_INSTRUCTION,
                      getRecentlyViewedSnippetsPrompt(longTermViewedSnippets)
                  )
                : ps``

        return {
            shortTermViewPrompt,
            longTermViewPrompt,
        }
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
        if (contextItems.length === 0) {
            return ps``
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

        return joinPromptsWithNewlineSeparator(
            constants.RECENT_EDITS_INSTRUCTION,
            getRecentEditsPrompt(combinedContextItems)
        )
    }
}
