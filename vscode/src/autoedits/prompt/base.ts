import type * as vscode from 'vscode'

import type {
    AutoEditsTokenLimit,
    AutocompleteContextSnippet,
    DocumentContext,
    PromptString,
} from '@sourcegraph/cody-shared'

import type { AutoeditsPrompt } from '../adapters/base'

import { SYSTEM_PROMPT } from './constants'
import { type CodeToReplaceData, getCompletionsPromptWithSystemPrompt } from './prompt-utils'

export interface UserPromptArgs {
    docContext: DocumentContext
    document: vscode.TextDocument
    position: vscode.Position
    context: AutocompleteContextSnippet[]
    tokenBudget: AutoEditsTokenLimit
}

export interface UserPromptResponse {
    codeToReplaceData: CodeToReplaceData
    prompt: PromptString
}

export interface UserPromptForModelArgs extends UserPromptArgs {
    isChatModel: boolean
}

export interface UserPromptForModelResponse {
    codeToReplaceData: CodeToReplaceData
    prompt: AutoeditsPrompt
}

/**
 * Class for generating user prompts in auto-edits functionality.
 * The major difference between different strategy is the prompt rendering.
 */
export abstract class AutoeditsUserPromptStrategy {
    protected abstract getUserPrompt(args: UserPromptArgs): UserPromptResponse

    public getPromptForModelType({
        isChatModel,
        ...userPromptArgs
    }: UserPromptForModelArgs): UserPromptForModelResponse {
        const { codeToReplaceData, prompt } = this.getUserPrompt(userPromptArgs)

        const adjustedPrompt: AutoeditsPrompt = isChatModel
            ? { systemMessage: SYSTEM_PROMPT, userMessage: prompt }
            : { userMessage: getCompletionsPromptWithSystemPrompt(SYSTEM_PROMPT, prompt) }

        return {
            codeToReplaceData,
            prompt: adjustedPrompt,
        }
    }
}
