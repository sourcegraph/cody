import * as vscode from 'vscode'

import { CodyPrompt, getDefaultCommandsMap } from '@sourcegraph/cody-shared/src/chat/prompts'

import { debug } from '../log'

import { CommandsMainMenu } from './menus/CommandsMainMenu'
import { createQuickPickItem } from './utils/helpers'
import { menu_options, menu_separators } from './utils/menu'

// Manage default commands created by the prompts in prompts.json
export class PromptsProvider {
    // The default prompts
    private defaultPromptsMap = getDefaultCommandsMap()

    // The commands grouped by default prompts and custom prompts
    private allCommands = new Map<string, CodyPrompt>()

    constructor() {
        // add the default prompts to the all commands map
        this.groupCommands(this.defaultPromptsMap)
    }

    /**
     * Find a prompt by its id
     */
    public get(id: string, isSlashCommand = false): CodyPrompt | undefined {
        if (id.startsWith('/') || isSlashCommand) {
            const commands = [...this.allCommands]
            const slashCommand = commands.find(command => command[1].slashCommand === id)
            return slashCommand ? slashCommand[1] : this.allCommands.get(id)
        }

        return this.allCommands.get(id)
    }

    /**
     * Retuen default and custom commands without the separator which is added for quick pick menu
     */
    public getGroupedCommands(): [string, CodyPrompt][] {
        return [...this.allCommands].filter(command => command[1].prompt !== 'separator')
    }

    /**
     * Group the default prompts with the custom prompts and add a separator
     */
    public groupCommands(customCommands = new Map<string, CodyPrompt>()): void {
        const combinedMap = new Map([...this.defaultPromptsMap])
        combinedMap.set('separator', { prompt: 'separator' })
        this.allCommands = new Map([...combinedMap, ...customCommands])
    }

    /**
     * Main Menu: Cody Commands
     */
    public async menu(showDesc = false): Promise<void> {
        try {
            const commandItems = [menu_separators.chat, menu_options.chat, menu_separators.commands]
            const allCommandItems = [...this.allCommands]?.map(commandItem => {
                const command = commandItem[1]
                if (command.prompt === 'separator') {
                    return menu_separators.customCommands
                }
                const description =
                    showDesc && command.slashCommand && command.type === 'default'
                        ? command.slashCommand
                        : command.type !== 'default'
                        ? command.type
                        : ''

                return createQuickPickItem(command.name || commandItem[0], description)
            })
            commandItems.push(...allCommandItems, menu_options.config)

            // Show the list of prompts to the user using a quick pick menu
            // const selectedPrompt = await vscode.window.showQuickPick([...commandItems], CodyMenu_CodyCommands)
            const selectedPrompt = await CommandsMainMenu.show([...commandItems])
            if (!selectedPrompt) {
                return
            }

            const selectedCommandID = selectedPrompt.label
            switch (true) {
                case !selectedCommandID:
                    break
                case selectedCommandID === menu_options.config.label:
                    return await vscode.commands.executeCommand('cody.settings.commands')
                case selectedCommandID === menu_options.chat.label:
                    return await vscode.commands.executeCommand('cody.inline.new')
                case selectedCommandID === menu_options.submit.label:
                    return await vscode.commands.executeCommand('cody.action.chat', selectedPrompt.detail)
            }

            // Run the prompt
            const prompt = this.get(selectedCommandID)
            if (!prompt) {
                return
            }

            await vscode.commands.executeCommand('cody.action.commands.exec', selectedCommandID)
        } catch (error) {
            debug('CommandsController:commandQuickPicker', 'error', { verbose: error })
        }
    }

    // dispose and reset the controller and builder
    public dispose(): void {
        this.allCommands = new Map()
        debug('CommandsController:dispose', 'disposed')
    }
}
