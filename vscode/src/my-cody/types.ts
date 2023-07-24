import { Preamble } from '@sourcegraph/cody-shared/src/chat/preamble'
import { CodyPromptContext } from '@sourcegraph/cody-shared/src/chat/recipes/my-prompt'

export interface MyPromptsJSON {
    // A set of reusable prompts where instructions and context can be configured.
    recipes: { [id: string]: CodyPrompt }
    // Premade are a set of prompts that are added to the start of every new conversation.
    // This is where we define the "persona" and "rules" to share with LLM
    premade?: CodyPromptPremade
    // Starter is added to the start of every human input sent to Cody.
    starter?: string
}

export interface CodyPrompt {
    prompt: string
    command?: string
    args?: string[]
    context?: CodyPromptContext
    type?: CodyPromptType
}

export interface CodyPromptPremade {
    actions: string
    rules: string
    answer: string
}

export type CodyPromptType = 'workspace' | 'user'

export interface MyPrompts {
    prompts: Map<string, CodyPrompt>
    premade?: Preamble
    starter: string
}

export const CustomRecipesFileName = '.vscode/cody.json'
