import type { CodyCommand } from '@sourcegraph/cody-shared'
import { window, commands } from 'vscode'
import { CustomCommandConfigMenuItems, CommandMenuOption } from './items'

import { vscodeDefaultCommands } from '../services/provider'
import { type CustomCommandsBuilder, CustomCommandsBuilderMenu } from './command-builder'
import type { CommandMenuItem } from './types'
import { CommandMenuTitleItem, CommandMenuSeperator, type CommandMenuButton } from './items'
import { openCustomCommandDocsLink } from '../services/custom-commands'
import { executeChat } from '../execute/ask'
import { executeEdit } from '../../edit/execute'

export async function showCommandMenu(
    type: 'default' | 'custom' | 'config',
    customCommands: CodyCommand[]
): Promise<void> {
    const items: CommandMenuItem[] = []
    const configOption = CommandMenuOption.config
    const addOption = CommandMenuOption.add

    // Add items to menu
    if (type === 'config') {
        items.push(...CustomCommandConfigMenuItems)
    } else {
        if (type === 'default') {
            items.push(CommandMenuSeperator.commands)
            for (const [_name, _command] of vscodeDefaultCommands) {
                const label = _command.slashCommand
                const description = _command.description ?? _command.prompt
                const command = _command.slashCommand
                items.push({ label, description, command })
            }
        }

        // Add custom commands
        items.push(CommandMenuSeperator.custom)
        for (const customCommand of customCommands) {
            const label = customCommand.slashCommand
            const description = customCommand.description ?? customCommand.prompt
            const command = customCommand.slashCommand
            items.push({ label, description, command })
        }

        // Extra options
        items.push(CommandMenuSeperator.settings, configOption)

        // The Create New Command option should show up in custom command menu only
        if (type === 'custom') {
            items.push(addOption)
        }
    }

    const options = CommandMenuTitleItem[type]

    return new Promise(resolve => {
        const quickPick = window.createQuickPick()
        quickPick.items = items
        quickPick.title = options.title
        quickPick.placeholder = options.placeHolder
        quickPick.matchOnDescription = true
        quickPick.buttons = CommandMenuTitleItem[type].buttons

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
            const selected = item.item as CommandMenuItem
            const button = item.button as CommandMenuButton
            if (selected.type && button?.command) {
                void commands.executeCommand(button.command, selected.type)
            }
            quickPick.hide()
        })

        quickPick.onDidChangeValue(value => {
            if (value?.startsWith('/')) {
                const commandKey = value.split(' ')[0]
                const isCommand = items.find(item => item.label === commandKey)
                if (commandKey && isCommand) {
                    isCommand.alwaysShow = true
                    quickPick.items = [isCommand]
                    return
                }
            }

            if (value && !value.startsWith('/')) {
                quickPick.items = [CommandMenuOption.edit, CommandMenuOption.chat, ...items]
            } else {
                quickPick.items = items
            }
        })

        quickPick.onDidAccept(async () => {
            const selection = quickPick.activeItems[0] as CommandMenuItem
            const value = normalize(quickPick.value)
            const selected = selection?.label || value

            // On item button click
            if (selection.buttons && selection.type && selection.command) {
                void commands.executeCommand(selection.command, selection.type)
            }

            // Option to create a new custom command
            if (selected === addOption.label && addOption.command) {
                void commands.executeCommand(addOption.command, selected)
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
            if (selectionHasIdField && (selection as CommandMenuItem).id === 'docs') {
                return openCustomCommandDocsLink()
            }

            // Check if it's an ask command
            if (selected.startsWith('/ask')) {
                const inputValue = value.replace(/^\/ask/, '').trim()
                // show input box if no value
                if (!inputValue) {
                    void showChatInputBox()
                } else {
                    void executeChat({ text: inputValue, submitType: 'user-newchat', source: 'menu' })
                }
                quickPick.hide()
                return
            }

            // Check if it's an edit command
            if (selected.startsWith('/edit')) {
                void executeEdit({ configuration: { instruction: value }, source: 'menu' })
                quickPick.hide()
                return
            }

            // Else, process the selection as custom command
            if (selected.startsWith('/')) {
                void commands.executeCommand('cody.action.command', selected + ' ' + value)
            }

            resolve()
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

async function showChatInputBox(): Promise<void> {
    const input = await window.showInputBox({
        title: '/ask Cody',
        placeHolder: 'Enter your question for Cody.',
    })
    if (!input) {
        return
    }
    void executeChat({ text: input, submitType: 'user-newchat', source: 'menu' })
}
