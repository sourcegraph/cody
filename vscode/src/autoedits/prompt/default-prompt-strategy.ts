import { type PromptString, ps } from '@sourcegraph/cody-shared'

import { shortenPromptForOutputChannel } from '../../../src/completions/output-channel-logger'
import { RetrieverIdentifier } from '../../completions/context/utils'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'

import { AutoeditsUserPromptStrategy, type UserPromptArgs } from './base'
import * as constants from './constants'
import {
    getContextItemMappingWithTokenLimit,
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

export class DefaultUserPromptStrategy extends AutoeditsUserPromptStrategy {
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

        const { fileWithMarkerPrompt, areaPrompt } = getCurrentFilePromptComponents(
            document,
            codeToReplaceData
        )

        const currentFilePrompt = ps`${constants.CURRENT_FILE_INSTRUCTION}${fileWithMarkerPrompt}`

        const finalPrompt = joinPromptsWithNewlineSeparator(
            getPromptWithNewline(constants.BASE_USER_PROMPT),
            getPromptWithNewline(rulesPrompt),
            getPromptWithNewline(jaccardSimilarityPrompt),
            getPromptWithNewline(recentViewsPrompt),
            getPromptWithNewline(currentFilePrompt),
            getPromptWithNewline(recentEditsPrompt),
            getPromptWithNewline(lintErrorsPrompt),
            getPromptWithNewline(recentCopyPrompt),
            getPromptWithNewline(areaPrompt),
            constants.FINAL_USER_PROMPT
        )

        autoeditsOutputChannelLogger.logDebugIfVerbose('DefaultUserPromptStrategy', 'getUserPrompt', {
            verbose: shortenPromptForOutputChannel(finalPrompt.toString(), []),
        })
        return finalPrompt
    }
}
