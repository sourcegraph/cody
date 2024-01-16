import { commands, QuickInputButtons, ThemeIcon, window, type QuickPickItem } from 'vscode'

import { type ContextOption } from '.'

export type QuickPickItemWithSlashCommand = QuickPickItem & { slashCommand: string }

export const ASK_QUESTION_COMMAND = {
    description: 'Ask a question',
    slashCommand: '/ask',
}
export const EDIT_COMMAND = {
    description: 'Edit code',
    slashCommand: '/edit',
}

const inlineSeparator: QuickPickItem = { kind: -1, label: 'inline' }
const chatOption: QuickPickItemWithSlashCommand = {
    label: ASK_QUESTION_COMMAND.slashCommand,
    description: ASK_QUESTION_COMMAND.description,
    slashCommand: ASK_QUESTION_COMMAND.slashCommand,
}
const fixOption: QuickPickItemWithSlashCommand = {
    label: EDIT_COMMAND.slashCommand,
    description: EDIT_COMMAND.description,
    slashCommand: EDIT_COMMAND.slashCommand,
}
// Seperators
const commandsSeparator: QuickPickItem = { kind: -1, label: 'commands' }
const customCommandsSeparator: QuickPickItem = { kind: -1, label: 'Custom Commands (Beta)' }
const settingsSeparator: QuickPickItem = { kind: -1, label: 'settings' }
const lastUsedSeparator: QuickPickItem = { kind: -1, label: 'last used' }
// Common options
const configOption: QuickPickItem = {
    label: 'Configure Custom Commands...',
    description: 'Manage your custom reusable commands',
}
const addOption: QuickPickItem = {
    label: 'New Custom Command...',
    alwaysShow: true,
    description: 'Create a new reusable command',
}

export const menu_separators = {
    inline: inlineSeparator,
    commands: commandsSeparator,
    customCommands: customCommandsSeparator,
    settings: settingsSeparator,
    lastUsed: lastUsedSeparator,
}

export const menu_options = {
    chat: chatOption,
    fix: fixOption,
    config: configOption,
    add: addOption,
}

const openIconButton = { iconPath: new ThemeIcon('go-to-file'), tooltip: 'Open or Create Settings File', id: 'open' }
const trashIconButton = { iconPath: new ThemeIcon('trash'), tooltip: 'Delete Settings File', id: 'delete' }
const gearIconButton = { iconPath: new ThemeIcon('gear'), tooltip: 'Configure Custom Commands...', id: 'config' }
const backIconButton = QuickInputButtons.Back

export const menu_buttons = {
    open: openIconButton,
    trash: trashIconButton,
    back: backIconButton,
    gear: gearIconButton,
}

// List of context types to include with the prompt
export const customPromptsContextOptions: ContextOption[] = [
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
        detail: 'First 10 text files in the current directory. If the prompt includes the words "test" or "tests", only test files will be included.',
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
        detail: 'The output returned from a terminal command (e.g. git describe --long, node your-script.js, cat src/file-name.js)',
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

// Ask user to confirm before trying to delete the cody.json file
export async function showRemoveConfirmationInput(): Promise<string | void> {
    const confirmRemove = await window.showWarningMessage(
        'Are you sure you want to remove the .vscode/cody.json file from your file system?',
        { modal: true },
        'Yes',
        'No'
    )
    return confirmRemove
}

// Quick pick menu to select a command from the list of available Custom Commands

// Quick pick menu with the correct command type (user or workspace) selections based on existing JSON files

export const CustomCommandConfigMenuItems = [
    {
        kind: 0,
        label: 'New Custom Command...',
        id: 'add',
    },
    { kind: -1, id: 'separator', label: '' },
    {
        kind: 0,
        label: 'Open User Settings (JSON)',
        detail: 'Stored on your machine and usable across all your workspaces/repositories',
        id: 'open',
        type: 'user',
        description: '~/.vscode/cody.json',
        buttons: [menu_buttons.open, menu_buttons.trash],
    },
    {
        kind: 0,
        label: 'Open Workspace Settings (JSON)',
        detail: 'Project-specific and shared with anyone using this workspace/repository',
        id: 'open',
        type: 'workspace',
        description: '.vscode/cody.json',
        buttons: [menu_buttons.open, menu_buttons.trash],
    },
    { kind: -1, id: 'separator', label: '' },
    { kind: 0, label: 'Open Custom Commands Documentation', id: 'docs' },
]

export async function showAskQuestionQuickPick(): Promise<string> {
    const quickPick = window.createQuickPick()
    quickPick.title = `${ASK_QUESTION_COMMAND.description} (${ASK_QUESTION_COMMAND.slashCommand})`
    quickPick.placeholder = 'Your question'
    quickPick.buttons = [menu_buttons.back]

    quickPick.onDidTriggerButton(() => {
        void commands.executeCommand('cody.action.commands.menu')
        quickPick.hide()
    })

    quickPick.show()

    return new Promise(resolve =>
        quickPick.onDidAccept(() => {
            const question = quickPick.value.trim()
            if (!question) {
                // noop
                return
            }

            quickPick.hide()
            return resolve(question)
        })
    )
}
