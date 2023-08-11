import { commands, QuickPickItem, QuickPickOptions, window } from 'vscode'

import { CodyPrompt } from '@sourcegraph/cody-shared'

import { CustomCommandsItem } from '../utils'
import { CustomCommandConfigMenuItems, menu_buttons, menu_options } from '../utils/menu'

import { CodyCommand, CustomCommandsBuilderMenu } from './CustomCommandBuilderMenu'

interface CommandMenuResponse {
    selectedItem: QuickPickItem
    input: string
}

export async function showCommandMenu(items: QuickPickItem[]): Promise<CommandMenuResponse> {
    const options = {
        title: 'Cody (Shortcut: ⌥C)',
        placeHolder: 'Search for a command or enter your question here...',
        ignoreFocusOut: true,
    }

    return new Promise(resolve => {
        let input = ''
        const quickPick = window.createQuickPick()
        quickPick.items = items
        quickPick.title = options.title
        quickPick.placeholder = options.placeHolder
        quickPick.ignoreFocusOut = options.ignoreFocusOut

        quickPick.buttons = [menu_buttons.gear]

        const labels = new Set(items.map(item => item.label))
        quickPick.onDidChangeValue(() => {
            if (quickPick.value && !labels.has(quickPick.value)) {
                quickPick.items = [menu_options.submitChat, menu_options.submitFix, ...items]
                input = quickPick.value
                return
            }
            quickPick.items = items
        })
        // On gear icon click
        quickPick.onDidTriggerButton(async () => {
            quickPick.hide()
            await commands.executeCommand('cody.settings.commands')
        })

        quickPick.onDidAccept(() => {
            const selection = quickPick.activeItems[0]
            resolve({ selectedItem: selection, input })
            quickPick.hide()
        })
        quickPick.show()
    })
}

export async function showCustomCommandMenu(items: QuickPickItem[]): Promise<QuickPickItem> {
    const CustomCommandsMenuOptions: QuickPickOptions = {
        title: 'Cody Custom Commands (Experimental)',
        placeHolder: 'Search command to run...',
        ignoreFocusOut: true,
    }

    return new Promise(resolve => {
        const quickPick = window.createQuickPick()
        quickPick.items = items
        quickPick.title = CustomCommandsMenuOptions.title
        quickPick.placeholder = CustomCommandsMenuOptions.placeHolder
        quickPick.ignoreFocusOut = true

        quickPick.onDidAccept(() => {
            const selection = quickPick.activeItems[0]
            resolve(selection)
            quickPick.hide()
        })
        quickPick.show()
    })
}

/**
 * Shows the custom command configuration menu and returns the selected item.
 */
export async function showCommandConfigMenu(): Promise<CustomCommandsItem> {
    const CustomCommandConfigMenuOptions = {
        title: 'Configure Custom Commands (Experimental)',
        placeHolder: 'Choose an option',
    }

    return new Promise(resolve => {
        const quickPick = window.createQuickPick()
        quickPick.items = CustomCommandConfigMenuItems
        quickPick.title = CustomCommandConfigMenuOptions.title
        quickPick.placeholder = CustomCommandConfigMenuOptions.placeHolder

        quickPick.buttons = [menu_buttons.back]

        // on item button click
        quickPick.onDidTriggerItemButton(item => {
            const selection = item.item as CustomCommandsItem
            selection.id = item.button.tooltip === 'delete' ? 'delete' : 'open'
            resolve(selection)
            quickPick.hide()
        })

        quickPick.onDidAccept(() => {
            const selection = quickPick.activeItems[0] as CustomCommandsItem
            resolve(selection)
            quickPick.hide()
        })

        quickPick.onDidTriggerButton(async () => {
            quickPick.hide()
            await commands.executeCommand('cody.action.commands.menu')
        })

        quickPick.show()
    })
}

/**
 * Show Menu for creating a new prompt via UI using the input box and quick pick without having to manually edit the cody.json file
 */
export async function showNewCustomCommandMenu(commands: Map<string, CodyPrompt>): Promise<CodyCommand | null> {
    const builder = new CustomCommandsBuilderMenu()
    return builder.start(commands)
}
