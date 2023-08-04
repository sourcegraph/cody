import { commands, QuickInputButtons, window } from 'vscode'

import { CodyPrompt } from '@sourcegraph/cody-shared'

import { CustomCommandsItem } from '../utils'
import { menu_buttons } from '../utils/menu'

import { CodyCommand, CustomCommandsBuilderMenu } from './CustomCommandBuilderMenu'

/**
 * @class CustomCommandsConfigMenu handles showing the menu for configuring custom commands.
 */
export class CustomCommandsConfigMenu {
    public id = 'config'

    /**
     * Shows the custom command configuration menu and returns the selected item.
     */
    public static async show(): Promise<CustomCommandsItem> {
        const CustomCommandConfigMenuItems = [
            {
                kind: 0,
                label: 'New Custom Command...',
                id: 'add',
                type: 'user',
                description: '',
            },
            { kind: -1, id: 'separator', label: '' },
            {
                kind: 0,
                label: 'User Settings (JSON)',
                id: 'open',
                type: 'user',
                description: '~/.vscode/cody.json',
                buttons: [menu_buttons.open, menu_buttons.file, menu_buttons.trash],
            },
            {
                kind: 0,
                label: 'Workspace Settings (JSON)',
                id: 'open',
                type: 'workspace',
                description: '.vscode/cody.json',
                buttons: [menu_buttons.open, menu_buttons.file, menu_buttons.trash],
            },
            { kind: -1, id: 'separator', label: '' },
            { kind: 0, label: 'Open Example Commands (JSON)', id: 'example', type: 'default' },
        ]

        const CustomCommandConfigMenuOptions = {
            title: 'Configure Custom Commands (Experimental)',
            placeHolder: 'Choose an option',
        }

        return new Promise(resolve => {
            const quickPick = window.createQuickPick()
            quickPick.items = CustomCommandConfigMenuItems
            quickPick.title = CustomCommandConfigMenuOptions.title
            quickPick.placeholder = CustomCommandConfigMenuOptions.placeHolder

            quickPick.buttons = [QuickInputButtons.Back]

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
    public static async add(commands: Map<string, CodyPrompt>): Promise<CodyCommand | null> {
        const builder = new CustomCommandsBuilderMenu(commands)
        return builder.start()
    }
}
