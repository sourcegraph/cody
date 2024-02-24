import type { CodyCommand } from '@sourcegraph/cody-shared'
import { commands, window } from 'vscode'
import { CommandMenuOption, CustomCommandConfigMenuItems } from './items'

import { CustomCommandType } from '@sourcegraph/cody-shared/src/commands/types'
import { CodyCommandMenuItems } from '..'
import { executeEdit } from '../../edit/execute'
import { telemetryService } from '../../services/telemetry'
import { telemetryRecorder } from '../../services/telemetry-v2'
import { executeChat } from '../execute/ask'
import { openCustomCommandDocsLink } from '../services/custom-commands'
import { type CustomCommandsBuilder, CustomCommandsBuilderMenu } from './command-builder'
import { type CommandMenuButton, CommandMenuSeperator, CommandMenuTitleItem } from './items'
import type { CommandMenuItem } from './types'

export async function showCommandMenu(
    type: 'default' | 'custom' | 'config',
    customCommands: CodyCommand[]
): Promise<void> {
    const items: CommandMenuItem[] = []
    const configOption = CommandMenuOption.config
    const addOption = CommandMenuOption.add

    telemetryService.log(`CodyVSCodeExtension:menu:command:${type}:clicked`)
    telemetryRecorder.recordEvent(`cody.menu:command:${type}`, 'clicked')

    // Add items to menus accordingly:
    // 1. default: contains default commands and custom commands
    // 2. custom (custom commands): contain custom commands and add custom command option
    // 3. config (settings): setting options for custom commands
    if (type === 'config') {
        items.push(...CustomCommandConfigMenuItems)
    } else {
        // Add Default Commands
        if (type !== 'custom') {
            items.push(CommandMenuSeperator.commands)
            for (const _command of CodyCommandMenuItems) {
                // Skip the 'Custom Commands' option
                if (_command.key === 'custom') {
                    continue
                }
                const key = _command.key
                const label = `$(${_command.icon}) ${_command.description}`
                const command = _command.command.command
                // Show keybind as description if present
                const description = _command.keybinding ? _command.keybinding : ''
                const type = 'default'
                items.push({ label, command, description, type, key })
            }
        }

        // Add Custom Commands
        if (customCommands?.length) {
            items.push(CommandMenuSeperator.custom)
            for (const customCommand of customCommands) {
                const label = `$(tools) ${customCommand.key}`
                const description = customCommand.description ?? customCommand.prompt
                const command = customCommand.key
                const key = customCommand.key
                const type = customCommand.type ?? CustomCommandType.User
                items.push({ label, description, command, type, key })
            }
        }

        // Extra options - Settings
        items.push(CommandMenuSeperator.settings)
        if (type === 'custom') {
            items.push(addOption) // Create New Custom Command option
        }
        items.push(configOption) // Configure Custom Command option
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
            if (type === 'default') {
                const commandKey = value.split(' ')[0]
                const isCommand = items.find(item => item.label === commandKey)
                if (commandKey && isCommand) {
                    isCommand.alwaysShow = true
                    quickPick.items = [isCommand]
                    return
                }

                if (value) {
                    quickPick.items = [
                        CommandMenuOption.chat,
                        CommandMenuOption.edit,
                        ...items.filter(i => i.key !== 'ask' && i.key !== 'edit'),
                    ]
                } else {
                    quickPick.items = items
                }
            }
        })

        quickPick.onDidAccept(async () => {
            const selection = quickPick.activeItems[0] as CommandMenuItem
            const value = normalize(quickPick.value)
            const source = 'menu'

            // On item button click
            if (selection.buttons && selection.type && selection.command) {
                void commands.executeCommand(selection.command, selection.type)
            }

            // Option to create a new custom command // config menu
            const commandOptions = [addOption.command, configOption.command]
            if (selection?.command && commandOptions.includes(selection.command)) {
                void commands.executeCommand(selection.command)
                quickPick.hide()
                return
            }

            // On selecting a default command
            if (selection.type === 'default' && selection.command) {
                // Check if it's an ask command
                if (selection.key === 'ask') {
                    // show input box if no value
                    if (!value) {
                        void commands.executeCommand('cody.chat.panel.new')
                    } else {
                        void executeChat({
                            text: value.trim(),
                            submitType: 'user-newchat',
                            source,
                        })
                    }
                    quickPick.hide()
                    return
                }

                // Check if it's an edit command
                if (selection.key === 'edit') {
                    void executeEdit({ configuration: { instruction: value }, source })
                    quickPick.hide()
                    return
                }

                void commands.executeCommand(selection.command, selection.type)
                quickPick.hide()
                return
            }

            // On selecting a custom command
            if (selection.key === selection.command) {
                void commands.executeCommand('cody.action.command', selection.key + ' ' + value)
                quickPick.hide()
                return
            }

            // Check if selection has a field called id
            const selectionHasIdField = Object.prototype.hasOwnProperty.call(selection, 'id')
            if (selectionHasIdField && (selection as CommandMenuItem).id === 'docs') {
                return openCustomCommandDocsLink()
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
    telemetryService.log('CodyVSCodeExtension:menu:custom:build:clicked')
    telemetryRecorder.recordEvent('cody.menu.custom.build', 'clicked')
    const builder = new CustomCommandsBuilderMenu()
    return builder.start(commands)
}
