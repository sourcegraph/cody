import { type AutocompleteContextSnippet, PromptString, ps } from '@sourcegraph/cody-shared'

import { RetrieverIdentifier } from '../../completions/context/utils'
import { shortenPromptForOutputChannel } from '../../completions/output-channel-logger'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'

import { AutoeditsUserPromptStrategy, type UserPromptArgs } from './base'
import * as constants from './constants'
import {
    getContextItemMappingWithTokenLimit,
    getContextItemsForIdentifier,
    getPromptForTheContextSource,
    getPromptWithNewline,
    joinPromptsWithNewlineSeparator,
} from './prompt-utils/common'
import { getCurrentFilePromptComponents } from './prompt-utils/current-file'
import { getLintErrorsPrompt } from './prompt-utils/lint'
import {
    getRecentEditsPrompt,
    groupConsecutiveRecentEditsItemsFromSameFile,
} from './prompt-utils/recent-edits'
import { getRecentlyViewedSnippetsPrompt } from './prompt-utils/recent-view'

interface RecentEditsPromptComponents {
    mostRecentEditsPrompt: PromptString
    shortTermEditsPrompt: PromptString
    longTermEditsPrompt: PromptString
}

export class PromptCacheOptimizedV1 extends AutoeditsUserPromptStrategy {
    // Recent edits with timestamp older than this will be included at the top of the prompt to reuse the cached.
    // Other recent edits will be included near the bottom of the prompt as they are more important.
    private readonly RECENT_EDIT_SHORT_TERM_TIME_MS = 60 * 1000 // 1 minute
    // Oldest timestamp for a snippet view that can be included in the prompt.
    private readonly SNIPPET_VIEW_MAX_TIMESTAMP_MS = 10 * 60 * 1000 // 10 minutes

    getUserPrompt({ context, tokenBudget, codeToReplaceData, document }: UserPromptArgs): PromptString {
        const contextItemMapping = getContextItemMappingWithTokenLimit(
            context,
            tokenBudget.contextSpecificTokenLimit,
            tokenBudget.contextSpecificNumItemsLimit
        )
        const recentViewedSnippetsPrompt = this.getRecentSnippetViewPrompt(
            contextItemMapping.get(RetrieverIdentifier.RecentViewPortRetriever) || []
        )
        const recentEditsPromptComponents = this.getRecentEditsPromptComponents(
            contextItemMapping.get(RetrieverIdentifier.RecentEditsRetriever) || []
        )
        const lintErrorsPrompt = this.getDiagnosticsPrompt(
            contextItemMapping.get(RetrieverIdentifier.DiagnosticsRetriever) || []
        )

        const { fileWithMarkerPrompt, areaPrompt } = getCurrentFilePromptComponents({
            document,
            codeToReplaceDataRaw: codeToReplaceData,
        })
        const currentFilePrompt = ps`${constants.CURRENT_FILE_INSTRUCTION}${fileWithMarkerPrompt}`

        const promptParts = [
            getPromptWithNewline(constants.BASE_USER_PROMPT),
            getPromptWithNewline(recentViewedSnippetsPrompt),
            getPromptWithNewline(recentEditsPromptComponents.longTermEditsPrompt),
            getPromptWithNewline(currentFilePrompt),
            getPromptWithNewline(recentEditsPromptComponents.shortTermEditsPrompt),
            getPromptWithNewline(lintErrorsPrompt),
            getPromptWithNewline(areaPrompt),
            getPromptWithNewline(recentEditsPromptComponents.mostRecentEditsPrompt),
            constants.FINAL_USER_PROMPT,
        ]

        const finalPrompt = PromptString.join(promptParts, ps``)

        autoeditsOutputChannelLogger.logDebugIfVerbose('PromptCacheOptimizedV1', 'getUserPrompt', {
            verbose: shortenPromptForOutputChannel(finalPrompt.toString(), []),
        })

        return finalPrompt
    }

    private getDiagnosticsPrompt(diagnosticsItems: AutocompleteContextSnippet[]): PromptString {
        const diagnostics = diagnosticsItems
        return getPromptForTheContextSource(
            diagnostics,
            constants.LINT_ERRORS_INSTRUCTION,
            getLintErrorsPrompt
        )
    }

    private getRecentSnippetViewPrompt(contextItems: AutocompleteContextSnippet[]): PromptString {
        const recentViewedSnippets = getContextItemsForIdentifier(
            contextItems,
            RetrieverIdentifier.RecentViewPortRetriever
        ).filter(
            item =>
                item.metadata?.timeSinceActionMs !== undefined &&
                item.metadata.timeSinceActionMs < this.SNIPPET_VIEW_MAX_TIMESTAMP_MS
        )

        return joinPromptsWithNewlineSeparator([
            constants.SHORT_TERM_SNIPPET_VIEWS_INSTRUCTION,
            getRecentlyViewedSnippetsPrompt(recentViewedSnippets),
        ])
    }

    private getRecentEditsPromptComponents(
        contextItems: AutocompleteContextSnippet[]
    ): RecentEditsPromptComponents {
        const recentEditsSnippets = getContextItemsForIdentifier(
            contextItems,
            RetrieverIdentifier.RecentEditsRetriever
        )

        const mostRecentEditsPrompt =
            recentEditsSnippets.length > 0 ? ps`${getRecentEditsPrompt([recentEditsSnippets[0]])}` : ps``

        const otherRecentEditsContextItems =
            recentEditsSnippets.length > 1 ? recentEditsSnippets.slice(1) : []

        const groupedContextItems = groupConsecutiveRecentEditsItemsFromSameFile(
            otherRecentEditsContextItems
        )

        const { shortTermSnippets, longTermSnippets } = this.splitContextItemsIntoShortAndLongTerm(
            groupedContextItems,
            this.RECENT_EDIT_SHORT_TERM_TIME_MS
        )

        return {
            mostRecentEditsPrompt,
            shortTermEditsPrompt: this.getRecentEditPromptWithInstruction(shortTermSnippets),
            longTermEditsPrompt: this.getRecentEditPromptWithInstruction(longTermSnippets),
        }
    }

    private getRecentEditPromptWithInstruction(snippets: AutocompleteContextSnippet[]): PromptString {
        if (snippets.length === 0) {
            return ps``
        }
        return joinPromptsWithNewlineSeparator([
            constants.RECENT_EDITS_INSTRUCTION,
            getRecentEditsPrompt(snippets),
        ])
    }

    private splitContextItemsIntoShortAndLongTerm(
        contextItems: AutocompleteContextSnippet[],
        shortTermTimeMs: number
    ): {
        shortTermSnippets: AutocompleteContextSnippet[]
        longTermSnippets: AutocompleteContextSnippet[]
    } {
        const shortTermSnippets: AutocompleteContextSnippet[] = []
        const longTermSnippets: AutocompleteContextSnippet[] = []
        for (const item of contextItems) {
            if (
                item.metadata?.timeSinceActionMs !== undefined &&
                item.metadata.timeSinceActionMs < shortTermTimeMs
            ) {
                shortTermSnippets.push(item)
            } else {
                longTermSnippets.push(item)
            }
        }
        return {
            shortTermSnippets,
            longTermSnippets,
        }
    }
}
