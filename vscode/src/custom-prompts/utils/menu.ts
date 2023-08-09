import { commands, QuickInputButtons, QuickPickItem, ThemeIcon, window } from 'vscode'

import { CodyPrompt } from '@sourcegraph/cody-shared'
import { CodyPromptType } from '@sourcegraph/cody-shared/src/chat/prompts'

import { ContextOption } from '.'

export const NewCustomCommandConfigMenuOptions = {
    title: 'Cody Custom Commands (Experimental) - New User Command',
}

const inlineSeparator: QuickPickItem = { kind: -1, label: 'inline' }
const chatOption: QuickPickItem = { label: 'Ask a Question' }
const fixOption: QuickPickItem = { label: 'Refactor This Code' }
const commandsSeparator: QuickPickItem = { kind: -1, label: 'commands' }
const customCommandsSeparator: QuickPickItem = { kind: -1, label: 'custom commands' }
const configOption: QuickPickItem = { label: 'Configure Custom Commands...' }
const settingsSeparator: QuickPickItem = { kind: -1, label: 'settings' }
const addOption: QuickPickItem = { label: 'New Custom User Command...', alwaysShow: true }
const chatSubmitOption: QuickPickItem = { label: 'Submit Question', alwaysShow: true }
const fixSubmitOption: QuickPickItem = { label: 'Submit Refactor Request', alwaysShow: true }

export const recentlyUsedSeparatorAsPrompt: [string, CodyPrompt][] = [
    ['separator', { prompt: 'separator', type: 'recently used' }],
]

export const menu_separators = {
    inline: inlineSeparator,
    commands: commandsSeparator,
    customCommands: customCommandsSeparator,
    settings: settingsSeparator,
}

export const menu_options = {
    chat: chatOption,
    fix: fixOption,
    config: configOption,
    add: addOption,
    submitChat: chatSubmitOption,
    submitFix: fixSubmitOption,
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

const openIconButton = { iconPath: new ThemeIcon('go-to-file'), tooltip: 'open / create', id: 'open' }
const trashIconButton = { iconPath: new ThemeIcon('trash'), tooltip: 'delete', id: 'delete' }
const backIconButton = QuickInputButtons.Back

export const menu_buttons = {
    open: openIconButton,
    trash: trashIconButton,
    back: backIconButton,
}

export const CustomCommandTypes = {
    user: userItem,
    workspace: workspaceItem,
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

export async function commandPicker(promptList: string[] = []): Promise<string> {
    const selectedRecipe = (await window.showQuickPick(promptList)) || ''
    return selectedRecipe
}

export async function quickChatInput(): Promise<void> {
    const humanInput = await window.showInputBox({
        prompt: 'Ask Cody a question...',
        placeHolder: 'e.g. What is a class in TypeScript?',
        validateInput: (input: string) => (input ? null : 'Please enter a question.'),
    })
    if (humanInput) {
        await commands.executeCommand('cody.action.chat', humanInput)
    }
}

// Quick pick menu with the correct command type (user or workspace) selections based on existing JSON files
export async function showcommandTypeQuickPick(
    action: 'file' | 'delete' | 'open',
    prompts: {
        user: number
        workspace: number
    }
): Promise<CodyPromptType | null> {
    const options: QuickPickItem[] = []
    const userItem = CustomCommandTypes.user
    const workspaceItem = CustomCommandTypes.workspace
    if (action === 'file') {
        if (prompts.user === 0) {
            options.push(userItem)
        }
        if (prompts.workspace === 0) {
            options.push(workspaceItem)
        }
    } else {
        if (prompts.user > 0) {
            options.push(userItem)
        }
        if (prompts.workspace > 0) {
            options.push(workspaceItem)
        }
    }
    const title = `Cody: Custom Commands - ${action === 'file' ? 'Creating Configure File...' : 'Command Type'}`
    const placeHolder = 'Select command type (when available) to continue, or ESC to cancel'
    // Show quick pick menu
    const commandType = await window.showQuickPick(options, { title, placeHolder })
    if (!commandType?.label) {
        return null
    }
    return (commandType.label.toLowerCase() === 'user' ? 'user' : 'workspace') as CodyPromptType
}

export const CustomCommandConfigMenuItems = [
    {
        kind: 0,
        label: 'New Custom User Command...',
        id: 'add',
        type: 'user',
        description: '',
    },
    { kind: -1, id: 'separator', label: '' },
    {
        kind: 0,
        label: 'Open User Settings (JSON)',
        id: 'open',
        type: 'user',
        description: '~/.vscode/cody.json',
        buttons: [menu_buttons.open, menu_buttons.trash],
    },
    {
        kind: 0,
        label: 'Open Workspace Settings (JSON)',
        id: 'open',
        type: 'workspace',
        description: '.vscode/cody.json',
        buttons: [menu_buttons.open, menu_buttons.trash],
    },
    { kind: -1, id: 'separator', label: '' },
    { kind: 0, label: 'See Example Commands', id: 'example', type: 'default' },
]
