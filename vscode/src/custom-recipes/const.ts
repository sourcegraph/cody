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
    name?: string
    prompt: string
    context?: CodyPromptContext
    type?: CodyPromptType
}

export interface CodyPromptPremade {
    actions: string
    rules: string
    answer: string
}

export type CodyPromptType = 'workspace' | 'user' | 'default' | 'last used'

export interface MyPrompts {
    prompts: Map<string, CodyPrompt>
    premade?: Preamble
    starter: string
}

export const CustomRecipesConfigFileName = '.vscode/cody.json'

// List of context types to include with the prompt
export const CustomRecipesContextOptions = [
    {
        id: 'selection',
        label: 'Selected Code',
        detail: 'Code currently highlighted in the active editor.',
        picked: true,
    },
    {
        id: 'codebase',
        label: 'Codebase',
        detail: 'Code snippets retrieved from the available source for codebase context (embeddings or local keyword search).',
        picked: false,
    },
    {
        id: 'currentDir',
        label: 'Current Directory',
        description: 'If the prompt includes "test(s)", only test files will be included.',
        detail: 'First 10 text files in the current directory',
        picked: false,
    },
    {
        id: 'openTabs',
        label: 'Current Open Tabs',
        detail: 'First 10 text files in current open tabs',
        picked: false,
    },
    {
        id: 'command',
        label: 'Command Output',
        detail: 'The output returned from a terminal command run from your local workspace. E.g. git describe --long',
        picked: false,
    },
    {
        id: 'none',
        label: 'None',
        detail: 'Exclude all types of context.',
        picked: false,
    },
]

export const CustomRecipesMainMenuOptions = [
    { kind: -1, label: 'recipes manager', id: 'seperator' },
    {
        kind: 0,
        label: '$(account) Add User Recipe',
        id: 'add',
        type: 'user',
        detail: 'Create a new recipe via UI and add it to your user config file',
    },
    {
        kind: 0,
        label: '$(organization) Add Workspace Recipe',
        id: 'add',
        type: 'workspace',
        detail: 'Add a recipe item to the JSON file for your current workspace',
    },
    { kind: 0, label: '$(output) My Recipes', id: 'list', detail: 'List of available recipes' },
    { kind: -1, label: '.vscode/cody.json', id: 'seperator' },
    { kind: 0, label: '$(trash) Delete Recipes Settings (JSON)', id: 'delete' },
]

export interface UserWorkspaceInfo {
    homeDir: string
    workspaceRoot?: string
    currentFilePath?: string
}

export const promptSizeInit = {
    user: 0,
    workspace: 0,
    default: 0,
    'last used': 0,
}
