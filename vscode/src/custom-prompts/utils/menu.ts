import { QuickPickItem } from 'vscode'

import { CodyPrompt } from '@sourcegraph/cody-shared'

export const CodyMenu_CodyCommands = {
    title: 'Cody Commands',
    placeHolder: 'Search for a command',
    ignoreFocusOut: true,
}

export const CodyMenu_CodyCustomCommands = {
    title: 'Cody Custom Commands (Experimental)',
    placeHolder: 'Search command to run...',
    ignoreFocusOut: true,
}

export const CodyMenu_NewCustomCommands = 'Cody Custom Commands (Experimental) - New User Command'

export const CodyMenu_CodyCustomCommandsConfig = {
    title: 'Configure Custom Commands (Experimental)',
    placeHolder: 'Choose an option',
}

const chatSeperator: QuickPickItem = { kind: -1, label: 'inline chat' }
const chatOption: QuickPickItem = { label: 'Ask a Question', alwaysShow: true }
const commandsSeperator: QuickPickItem = { kind: -1, label: 'commands' }
const customCommandsSeperator: QuickPickItem = { kind: -1, label: 'custom commands' }
const configOption: QuickPickItem = { label: 'Configure Custom Commands...' }
const settingsSeperator: QuickPickItem = { kind: -1, label: 'settings' }
const addOption: QuickPickItem = { label: 'New Custom Command...', alwaysShow: true }

export const recentlyUsedSeperatorAsPrompt: [string, CodyPrompt][] = [
    ['seperator', { prompt: 'seperator', type: 'recently used' }],
]

export const menu_seperators = {
    chat: chatSeperator,
    commands: commandsSeperator,
    customCommands: customCommandsSeperator,
    settings: settingsSeperator,
}

export const menu_options = {
    chat: chatOption,
    config: configOption,
    add: addOption,
}

const userItem: QuickPickItem = {
    label: 'User',
    detail: 'Stored on your machine and usable across all your workspaces',
    description: '~/.vscode/cody.json',
}

const workspaceItem: QuickPickItem = {
    label: 'Workspace (Repository)',
    detail: 'Project-specific and shared with anyone using this workspace',
    description: '.vscode/cody.json',
}

export const CustomCommandTypes = {
    user: userItem,
    workspace: workspaceItem,
}

export const CustomPromptsMainMenuOptions = [
    {
        kind: 0,
        label: 'New Custom Command...',
        id: 'add',
        type: 'user',
        description: '',
    },
    { kind: -1, id: 'seperator', label: '' },
    {
        kind: 0,
        label: 'Open User Settings (JSON)',
        id: 'open',
        type: 'user',
        description: '~/.vscode/cody.json',
    },
    {
        kind: 0,
        label: 'Open Workspace Settings (JSON)',
        id: 'open',
        type: 'workspace',
        description: '.vscode/cody.json',
    },
    { kind: -1, id: 'seperator', label: '' },
    { kind: 0, label: 'Open Example Commands (JSON)', id: 'example', type: 'default' },
]

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

export const promptSizeInit = {
    user: 0,
    workspace: 0,
    default: 0,
    'recently used': 0,
}
