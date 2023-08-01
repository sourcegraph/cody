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

export const menu_commandTypes = {
    user: userItem,
    workspace: workspaceItem,
}
