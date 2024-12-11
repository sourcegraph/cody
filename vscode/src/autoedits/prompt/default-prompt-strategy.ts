import { psDedent } from '@sourcegraph/cody-shared'
import { RetrieverIdentifier } from '../../completions/context/utils'
import { autoeditsLogger } from '../logger'
import type { AutoeditsUserPromptStrategy, UserPromptArgs, UserPromptResponse } from './base'
import * as constants from './constants'
import {
    getContextItemMappingWithTokenLimit,
    getCurrentFilePromptComponents,
    getJaccardSimilarityPrompt,
    getLintErrorsPrompt,
    getPromptForTheContextSource,
    getRecentCopyPrompt,
    getRecentEditsPrompt,
    getRecentlyViewedSnippetsPrompt,
} from './prompt-utils'

export class DefaultUserPromptStrategy implements AutoeditsUserPromptStrategy {
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
        const recentViewsPrompt = getPromptForTheContextSource(
            contextItemMapping.get(RetrieverIdentifier.RecentViewPortRetriever) || [],
            constants.LONG_TERM_SNIPPET_VIEWS_INSTRUCTION,
            getRecentlyViewedSnippetsPrompt
        )

        const recentEditsPrompt = getPromptForTheContextSource(
            contextItemMapping.get(RetrieverIdentifier.RecentEditsRetriever) || [],
            constants.RECENT_EDITS_INSTRUCTION,
            getRecentEditsPrompt
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
        const finalPrompt = psDedent`
            ${constants.BASE_USER_PROMPT}
            ${jaccardSimilarityPrompt}
            ${recentViewsPrompt}
            ${constants.CURRENT_FILE_INSTRUCTION}${fileWithMarkerPrompt}
            ${recentEditsPrompt}
            ${lintErrorsPrompt}
            ${recentCopyPrompt}
            ${areaPrompt}
            ${constants.FINAL_USER_PROMPT}`

        autoeditsLogger.logDebug('AutoEdits', 'Prompt\n', finalPrompt)
        return {
            codeToReplace: codeToReplace,
            prompt: finalPrompt,
        }
    }
}
