import type { CodyCommand } from '@sourcegraph/cody-shared'
import { platform } from 'os'
import { window, type QuickPickItem, commands } from 'vscode'
import { CustomCommandConfigMenuItems, menu_buttons, menu_options, menu_separators } from './const'

import { vscodeDefaultCommands } from '../manager'
import { openCustomCommandDocsLink } from '../custom-commands/helpers'
import { type CustomCommandsBuilder, CustomCommandsBuilderMenu } from './custom-builder'
import type { CustomCommandsItem } from './types'

const commandMenuByType = {
    default: {
        title: `Cody Commands (Shortcut: ${platform() === 'darwin' ? '⌥' : 'Alt+'}C)`,
        placeHolder: 'Search for a command or enter your question here...',
    },
    custom: {
        title: 'Cody: Custom Commands (Beta)',
        placeHolder: 'Search command to run...',
    },
    config: {
        title: 'Cody: Configure Custom Commands (Beta)',
        placeHolder: 'Choose an option',
    },
}

const buttonsByType = {
    default: [menu_buttons.gear],
    custom: [menu_buttons.back, menu_buttons.gear],
    config: [menu_buttons.back],
}

export async function showCommandMenu(
    type: 'default' | 'custom' | 'config',
    customCommands: CodyCommand[]
): Promise<void> {
    const items: QuickPickItem[] = []
    const configOption = menu_options.config
    const addOption = menu_options.add

    // Add items to menu
    if (type === 'config') {
        items.push(...CustomCommandConfigMenuItems)
    } else {
        if (type === 'default') {
            items.push(menu_separators.commands)
            for (const [_name, command] of vscodeDefaultCommands) {
                const label = command.slashCommand
                const description = command.description
                items.push({ label, description })
            }
        }

        // Add custom commands
        items.push(menu_separators.customBeta)
        for (const customCommand of customCommands) {
            const label = customCommand.slashCommand
            const description = customCommand.description
            items.push({ label, description })
        }

        // Extra options
        items.push(menu_separators.settings, configOption, addOption)
    }

    const options = commandMenuByType[type]

    return new Promise(resolve => {
        const quickPick = window.createQuickPick()
        quickPick.items = items
        quickPick.title = options.title
        quickPick.placeholder = options.placeHolder
        quickPick.matchOnDescription = true
        quickPick.buttons = buttonsByType[type]
        quickPick.matchOnDescription = true

        quickPick.onDidTriggerButton(async item => {
            // On gear icon click
            if (item.tooltip?.startsWith('Configure')) {
                await showCommandMenu('config', customCommands)
                return
            }
            // On back button click
            await showCommandMenu('default', customCommands)
            quickPick.hide()
        })

        // Open or delete custom command files
        quickPick.onDidTriggerItemButton(item => {
            const selected = item.item as CustomCommandsItem
            if (selected.type) {
                void commands.executeCommand(
                    item.button.tooltip?.startsWith('Delete')
                        ? 'cody.commands.delete.json'
                        : 'cody.commands.open.json',
                    selected.type
                )
            }
            quickPick.hide()
        })

        quickPick.onDidChangeValue(value => {
            if (value && !value.startsWith('/')) {
                quickPick.items = [menu_options.fix, menu_options.chat, ...items]
            } else {
                quickPick.items = items
            }
        })

        quickPick.onDidAccept(async () => {
            const selection = quickPick.activeItems[0]
            const value = normalize(quickPick.value)
            const selected = selection?.label || value

            if (selected === addOption.label) {
                void commands.executeCommand('cody.commands.add', selected)
                quickPick.hide()
                return
            }

            // On config option click
            if (selected === configOption.label) {
                await showCommandMenu('config', customCommands)
                quickPick.hide()
                return
            }

            // Check if selection has a field called id
            const selectionHasIdField = Object.prototype.hasOwnProperty.call(selection, 'id')
            if (selectionHasIdField && (selection as CustomCommandsItem).id === 'docs') {
                return openCustomCommandDocsLink()
            }

            // Else, process the selection as a command
            if (selected.startsWith('/')) {
                void commands.executeCommand('cody.action.commands.exec', selected)
            }

            quickPick.hide()
            return
        })
        quickPick.show()
    })
}

function normalize(input: string): string {
    return input.trim().toLowerCase()
}

/**
 * Show Menu for creating a new prompt via UI using the input box and quick pick without having to manually edit the cody.json file
 */
export async function showNewCustomCommandMenu(
    commands: string[]
): Promise<CustomCommandsBuilder | null> {
    const builder = new CustomCommandsBuilderMenu()
    return builder.start(commands)
}
