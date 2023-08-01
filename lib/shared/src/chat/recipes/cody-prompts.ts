import { Preamble } from '../preamble'

// Type of context available for prompt building
export interface CodyPromptContext {
    codebase: boolean
    openTabs?: boolean
    currentDir?: boolean
    currentFile?: boolean
    selection?: boolean
    command?: string
    output?: string
    filePath?: string
    directoryPath?: string
    none?: boolean
}

// Default to include selection context only
export const defaultCodyPromptContext: CodyPromptContext = {
    codebase: false,
    selection: true,
}

export interface MyPrompts {
    commands: Map<string, CodyPrompt>
    recipes?: Map<string, CodyPrompt>
    premade?: Preamble
    starter: string
}

export interface MyPromptsJSON {
    // A set of reusable prompts where instructions and context can be configured.
    commands: { [id: string]: CodyPrompt }
    // backward compatibility
    recipes?: { [id: string]: CodyPrompt }
    // Premade are a set of prompts that are added to the start of every new conversation.
    // This is where we define the "persona" and "rules" to share with LLM
    premade?: CodyPromptPremade
    // Starter is added to the start of every human input sent to Cody.
    starter?: string
}

export interface CodyPrompt {
    name?: string
    prompt: string
    context?: CodyPromptContext
    type?: CodyPromptType
    slashCommand?: string
}

export interface CodyPromptPremade {
    actions: string
    rules: string
    answer: string
}

export type CodyPromptType = 'workspace' | 'user' | 'default' | 'recently used'

export const CustomPromptsConfigFileName = '.vscode/cody.json'
