import { type PromptString, ps, psDedent } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import type {
    AutocompleteContextSnippet,
    DocumentContext,
} from '../../../lib/shared/src/completions/types'
import { RetrieverIdentifier } from '../completions/context/utils'
import type { AutoEditsTokenLimit } from './autoedits-provider'
import * as utils from './prompt-utils'

export type CompletionsPrompt = PromptString
export type ChatPrompt = {
    role: 'system' | 'user' | 'assistant'
    content: PromptString
}[]
export type PromptProviderResponse = CompletionsPrompt | ChatPrompt

export interface PromptProvider {
    getPrompt(
        docContext: DocumentContext,
        document: vscode.TextDocument,
        context: AutocompleteContextSnippet[],
        tokenBudget: AutoEditsTokenLimit
    ): PromptProviderResponse

    postProcessResponse(completion: string | null): string
}

export class OpenAIPromptProvider implements PromptProvider {
    getPrompt(
        docContext: DocumentContext,
        document: vscode.TextDocument,
        context: AutocompleteContextSnippet[],
        tokenBudget: AutoEditsTokenLimit
    ): PromptProviderResponse {
        const userPrompt = getBaseUserPrompt(docContext, document, context, tokenBudget)
        return [
            {
                role: 'system',
                content: SYSTEM_PROMPT,
            },
            {
                role: 'user',
                content: userPrompt,
            },
        ]
    }

    postProcessResponse(response: string): string {
        return response
    }
}

export class DeepSeekPromptProvider implements PromptProvider {
    private readonly bosToken: PromptString = ps`<｜begin▁of▁sentence｜>`
    private readonly userToken: PromptString = ps`User: `
    private readonly assistantToken: PromptString = ps`Assistant: `

    getPrompt(
        docContext: DocumentContext,
        document: vscode.TextDocument,
        context: AutocompleteContextSnippet[],
        tokenBudget: AutoEditsTokenLimit
    ): CompletionsPrompt {
        const userPrompt = getBaseUserPrompt(docContext, document, context, tokenBudget)
        const prompt = psDedent`${this.bosToken}${SYSTEM_PROMPT}

            ${this.userToken}${userPrompt}

            ${this.assistantToken}`

        return prompt
    }

    postProcessResponse(response: string): string {
        return response
    }
}

// ################################################################################################################

// Some common prompt instructions
const SYSTEM_PROMPT = ps`You are an intelligent programmer named CodyBot. You are an expert at coding. Your goal is to help your colleague finish a code change.`
const BASE_USER_PROMPT = ps`Help me finish a coding change. In particular, you will see a series of snippets from current open files in my editor, files I have recently viewed, the file I am editing, then a history of my recent codebase changes, then current compiler and linter errors, content I copied from my codebase. You will then rewrite the <code_to_rewrite>, to match what you think I would do next in the codebase. Note: I might have stopped in the middle of typing.`
const FINAL_USER_PROMPT = ps`Now, continue where I left off and finish my change by rewriting "code_to_rewrite":`
const RECENT_VIEWS_INSTRUCTION = ps`Here are some snippets of code I have recently viewed, roughly from oldest to newest. It's possible these aren't entirely relevant to my code change:\n`
const JACCARD_SIMILARITY_INSTRUCTION = ps`Here are some snippets of code I have extracted from open files in my code editor. It's possible these aren't entirely relevant to my code change:\n`
const RECENT_EDITS_INSTRUCTION = ps`Here is my recent series of edits from oldest to newest.\n`
const LINT_ERRORS_INSTRUCTION = ps`Here are some linter errors from the code that you will rewrite.\n`
const RECENT_COPY_INSTRUCTION = ps`Here is some recent code I copied from the editor.\n`
const CURRENT_FILE_INSTRUCTION = ps`Here is the file that I am looking at `

// Helper function to get prompt in some format
export function getBaseUserPrompt(
    docContext: DocumentContext,
    document: vscode.TextDocument,
    context: AutocompleteContextSnippet[],
    tokenBudget: AutoEditsTokenLimit
): PromptString {
    const contextItemMapping = utils.getContextItemMappingWithTokenLimit(
        context,
        tokenBudget.contextSpecificTokenLimit
    )
    const { fileWithMarkerPrompt, codeToRewritePrompt } = utils.getCurrentFilePromptComponents({
        docContext,
        document,
        maxPrefixLinesInArea: tokenBudget.maxPrefixLinesInArea,
        maxSuffixLinesInArea: tokenBudget.maxSuffixLinesInArea,
        codeToRewritePrefixLines: tokenBudget.codeToRewritePrefixLines,
        codeToRewriteSuffixLines: tokenBudget.codeToRewriteSuffixLines,
    })
    const recentViewsPrompt = utils.getPromptForTheContextSource(
        contextItemMapping.get(RetrieverIdentifier.RecentViewPortRetriever) || [],
        RECENT_VIEWS_INSTRUCTION,
        utils.getRecentlyViewedSnippetsPrompt
    )

    const recentEditsPrompt = utils.getPromptForTheContextSource(
        contextItemMapping.get(RetrieverIdentifier.RecentEditsRetriever) || [],
        RECENT_EDITS_INSTRUCTION,
        utils.getRecentEditsPrompt
    )

    const lintErrorsPrompt = utils.getPromptForTheContextSource(
        contextItemMapping.get(RetrieverIdentifier.DiagnosticsRetriever) || [],
        LINT_ERRORS_INSTRUCTION,
        utils.getLintErrorsPrompt
    )

    const recentCopyPrompt = utils.getPromptForTheContextSource(
        contextItemMapping.get(RetrieverIdentifier.RecentCopyRetriever) || [],
        RECENT_COPY_INSTRUCTION,
        utils.getRecentCopyPrompt
    )

    const jaccardSimilarityPrompt = utils.getPromptForTheContextSource(
        contextItemMapping.get(RetrieverIdentifier.JaccardSimilarityRetriever) || [],
        JACCARD_SIMILARITY_INSTRUCTION,
        utils.getJaccardSimilarityPrompt
    )
    return ps`${BASE_USER_PROMPT}
${jaccardSimilarityPrompt}
${recentViewsPrompt}
${CURRENT_FILE_INSTRUCTION}${fileWithMarkerPrompt}
${recentEditsPrompt}
${lintErrorsPrompt}
${recentCopyPrompt}
${codeToRewritePrompt}
${FINAL_USER_PROMPT}
`
}

// ################################################################################################################
