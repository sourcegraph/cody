import type {
    AutoEditsTokenLimit,
    AutocompleteContextSnippet,
    PromptString,
} from '@sourcegraph/cody-shared'

import type { AutoeditsPrompt } from '../adapters/base'

import { SYSTEM_PROMPT } from './constants'
import { type CurrentFilePromptComponents, getCompletionsPromptWithSystemPrompt } from './prompt-utils'

export interface UserPromptArgs
    extends Pick<CurrentFilePromptComponents, 'areaPrompt' | 'fileWithMarkerPrompt'> {
    context: AutocompleteContextSnippet[]
    tokenBudget: AutoEditsTokenLimit
}

export interface UserPromptForModelArgs extends UserPromptArgs {
    isChatModel: boolean
}

/**
 * Class for generating user prompts in auto-edits functionality.
 * The major difference between different strategy is the prompt rendering.
 */
export abstract class AutoeditsUserPromptStrategy {
    protected abstract getUserPrompt(args: UserPromptArgs): PromptString

    public getPromptForModelType({
        isChatModel,
        ...userPromptArgs
    }: UserPromptForModelArgs): AutoeditsPrompt {
        const prompt = this.getUserPrompt(userPromptArgs)

        const adjustedPrompt: AutoeditsPrompt = isChatModel
            ? { systemMessage: SYSTEM_PROMPT, userMessage: prompt }
            : { userMessage: getCompletionsPromptWithSystemPrompt(SYSTEM_PROMPT, prompt) }

        return adjustedPrompt
    }
}
