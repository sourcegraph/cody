import { type AutocompleteContextSnippet, type PromptString, ps } from '@sourcegraph/cody-shared'
import { RetrieverIdentifier } from '../../completions/context/utils'
import { autoeditsLogger } from '../logger'
import type { AutoeditsUserPromptStrategy, UserPromptArgs, UserPromptResponse } from './base'
import * as constants from './constants'
import {
    getContextItemMappingWithTokenLimit,
    getContextItemsForIdentifier,
    getCurrentFilePromptComponents,
    getJaccardSimilarityPrompt,
    getLintErrorsPrompt,
    getPromptForTheContextSource,
    getRecentCopyPrompt,
    getRecentEditsPrompt,
    getRecentlyViewedSnippetsPrompt,
} from './prompt-utils'

export class ShortTermPromptStrategy implements AutoeditsUserPromptStrategy {
    private readonly SHORT_TERM_SNIPPET_VIEW_TIME_MS = 60 * 1000 // 1 minute

    getUserPrompt({
        docContext,
        document,
        position,
        context,
        tokenBudget,
    }: UserPromptArgs): UserPromptResponse {
        const contextItemMapping = getContextItemMappingWithTokenLimit(
            context,
            tokenBudget.contextSpecificTokenLimit
        )
        const { fileWithMarkerPrompt, areaPrompt, codeToReplace } = getCurrentFilePromptComponents({
            docContext,
            document,
            position,
            maxPrefixLinesInArea: tokenBudget.maxPrefixLinesInArea,
            maxSuffixLinesInArea: tokenBudget.maxSuffixLinesInArea,
            codeToRewritePrefixLines: tokenBudget.codeToRewritePrefixLines,
            codeToRewriteSuffixLines: tokenBudget.codeToRewriteSuffixLines,
        })
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
        const finalPrompt = ps`${constants.BASE_USER_PROMPT}
${jaccardSimilarityPrompt}
${longTermViewPrompt}
${constants.CURRENT_FILE_INSTRUCTION}${fileWithMarkerPrompt}
${shortTermViewPrompt}
${longTermEditsPrompt}
${lintErrorsPrompt}
${recentCopyPrompt}
${areaPrompt}
${shortTermEditsPrompt}
${constants.FINAL_USER_PROMPT}
`
        autoeditsLogger.logDebug('AutoEdits', 'Prompt\n', finalPrompt)
        return {
            codeToReplace: codeToReplace,
            prompt: finalPrompt,
        }
    }

    getRecentSnippetViewPrompt(contextItems: AutocompleteContextSnippet[]): {
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
                ? ps`${constants.SHORT_TERM_SNIPPET_VIEWS_INSTRUCTION}${getRecentlyViewedSnippetsPrompt(
                      shortTermViewedSnippets
                  )}`
                : ps``

        const longTermViewPrompt =
            longTermViewedSnippets.length > 0
                ? ps`${constants.LONG_TERM_SNIPPET_VIEWS_INSTRUCTION}${getRecentlyViewedSnippetsPrompt(
                      longTermViewedSnippets
                  )}`
                : ps``

        return {
            shortTermViewPrompt,
            longTermViewPrompt,
        }
    }

    getRecentEditsPrompt(contextItems: AutocompleteContextSnippet[]): {
        shortTermEditsPrompt: PromptString
        longTermEditsPrompt: PromptString
    } {
        const recentEditsSnippets = getContextItemsForIdentifier(
            contextItems,
            RetrieverIdentifier.RecentEditsRetriever
        )
        let shortTermEditsPrompt = ps``
        let longTermEditsPrompt = ps``

        if (recentEditsSnippets.length > 0) {
            shortTermEditsPrompt = ps`${getRecentEditsPrompt([recentEditsSnippets[0]])}`
        }

        if (recentEditsSnippets.length > 1) {
            longTermEditsPrompt = ps`${constants.RECENT_EDITS_INSTRUCTION}${getRecentEditsPrompt(
                recentEditsSnippets.slice(1)
            )}`
        }
        return {
            shortTermEditsPrompt,
            longTermEditsPrompt,
        }
    }
}
