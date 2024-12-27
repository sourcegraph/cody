import { type PromptString, ps } from '@sourcegraph/cody-shared'

import { RetrieverIdentifier } from '../../completions/context/utils'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'

import { AutoeditsUserPromptStrategy, type UserPromptArgs } from './base'
import * as constants from './constants'
import {
    getContextItemMappingWithTokenLimit,
    getJaccardSimilarityPrompt,
    getLintErrorsPrompt,
    getPromptForTheContextSource,
    getPromptWithNewline,
    getRecentCopyPrompt,
    getRecentEditsPrompt,
    getRecentlyViewedSnippetsPrompt,
    joinPromptsWithNewlineSeparator,
} from './prompt-utils'

export class DefaultUserPromptStrategy extends AutoeditsUserPromptStrategy {
    getUserPrompt({
        context,
        tokenBudget,
        fileWithMarkerPrompt,
        areaPrompt,
    }: UserPromptArgs): PromptString {
        const contextItemMapping = getContextItemMappingWithTokenLimit(
            context,
            tokenBudget.contextSpecificTokenLimit
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

        const currentFilePrompt = ps`${constants.CURRENT_FILE_INSTRUCTION}${fileWithMarkerPrompt}`

        const finalPrompt = joinPromptsWithNewlineSeparator(
            getPromptWithNewline(constants.BASE_USER_PROMPT),
            getPromptWithNewline(jaccardSimilarityPrompt),
            getPromptWithNewline(recentViewsPrompt),
            getPromptWithNewline(currentFilePrompt),
            getPromptWithNewline(recentEditsPrompt),
            getPromptWithNewline(lintErrorsPrompt),
            getPromptWithNewline(recentCopyPrompt),
            getPromptWithNewline(areaPrompt),
            constants.FINAL_USER_PROMPT
        )

        autoeditsOutputChannelLogger.logDebug('getUserPrompt', 'Prompt\n', finalPrompt)
        return finalPrompt
    }
}
