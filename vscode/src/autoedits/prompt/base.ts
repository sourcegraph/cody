import type * as vscode from 'vscode'

import type {
    AutoEditsTokenLimit,
    AutocompleteContextSnippet,
    CodeToReplaceData,
    PromptString,
} from '@sourcegraph/cody-shared'

import type { AutoeditsPrompt } from '../adapters/base'

import { SYSTEM_PROMPT } from './constants'
import { getCompletionsPromptWithSystemPrompt } from './prompt-utils'

export interface UserPromptArgs {
    document: vscode.TextDocument
    codeToReplaceData: CodeToReplaceData
    context: AutocompleteContextSnippet[]
    tokenBudget: AutoEditsTokenLimit
}

interface UserPromptForModelArgs extends UserPromptArgs {
    isChatModel: boolean
}

const IS_AGENT_TESTING = process.env.CODY_SHIM_TESTING === 'true'

/**
 * Class for generating user prompts in auto-edit functionality.
 * The major difference between different strategy is the prompt rendering.
 */
export abstract class AutoeditsUserPromptStrategy {
    protected abstract getUserPrompt(args: UserPromptArgs): PromptString

    public getPromptForModelType({
        isChatModel,
        ...userPromptArgs
    }: UserPromptForModelArgs): AutoeditsPrompt {
        // We want our Agent tests to have a deterministic prompt so we can match a network recording.
        // We omit `context` here to avoid cases where the auto-edit prompt includes snippets about recently viewed
        // files. This can change depending on the order tests were ran.
        const context = IS_AGENT_TESTING ? [] : userPromptArgs.context
        const prompt = this.getUserPrompt({ ...userPromptArgs, context })

        const adjustedPrompt: AutoeditsPrompt = isChatModel
            ? { systemMessage: SYSTEM_PROMPT, userMessage: prompt }
            : { userMessage: getCompletionsPromptWithSystemPrompt(SYSTEM_PROMPT, prompt) }

        return adjustedPrompt
    }
}
