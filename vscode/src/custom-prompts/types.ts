import { CodyPromptType } from '@sourcegraph/cody-shared/src/chat/recipes/cody-prompts'

// List of context types to include with the prompt
export const CustomPromptsContextOptions = [
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

export type CustomPromptsMenuAnswerType = 'add' | 'file' | 'delete' | 'list' | 'open' | 'cancel'

export interface CustomPromptsMenuAnswer {
    actionID: CustomPromptsMenuAnswerType
    commandType: CodyPromptType
}

export const CustomPromptsMainMenuOptions = [
    {
        kind: 0,
        label: 'New Custom Command...',
        id: 'add',
        type: '',
        description: '',
    },
    { kind: -1, id: 'seperator', label: '' },
    {
        kind: 0,
        label: 'Open Workspace Settings (JSON)',
        id: 'open',
        type: 'workspace',
        description: '.vscode/cody.json',
    },
    {
        kind: 0,
        label: 'Open User Settings (JSON)',
        id: 'add',
        type: 'user',
        description: '~/.vscode/cody.json',
    },
    { kind: -1, id: 'seperator', label: '' },
    { kind: 0, label: 'Open Example Commands (JSON)', id: 'open', type: 'default' },
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
    'recently used': 0,
}
