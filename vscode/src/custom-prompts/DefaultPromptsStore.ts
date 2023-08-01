import * as vscode from 'vscode'

import { CodyPrompt } from '@sourcegraph/cody-shared/src/chat/recipes/cody-prompts'

import { debug } from '../log'

import { CodyMenu_CodyCommands, menu_options, menu_seperators } from './menuOptions'
import * as defaultCommands from './prompts.json'

// Manage default commands created by the prompts in prompts.json
export class DefaultPromptsStore {
    private defaultPromptsMap = new Map<string, CodyPrompt>()
    private allCommands = new Map<string, CodyPrompt>()

    constructor() {
        const prompts = defaultCommands.commands as Record<string, unknown>
        for (const key in prompts) {
            if (Object.prototype.hasOwnProperty.call(prompts, key)) {
                const prompt = prompts[key] as CodyPrompt
                prompt.name = key
                prompt.type = 'default'
                if (prompt.slashCommand) {
                    const slashCommand = '/' + prompt.slashCommand
                    prompt.slashCommand = slashCommand
                }
                this.defaultPromptsMap.set(key, prompt)
            }
        }
        this.groupCommands(this.defaultPromptsMap)
        debug('MyPromptsProvider', 'initialized')
    }

    public get(id: string, isSlashCommand = false): CodyPrompt | undefined {
        if (id.startsWith('/') || isSlashCommand) {
            const commands = [...this.allCommands]
            const slashCommand = commands.find(command => command[1].slashCommand === id)
            return slashCommand ? slashCommand[1] : this.allCommands.get(id)
        }
        return this.allCommands.get(id)
    }

    public getGroupedCommands(): [string, CodyPrompt][] {
        return [...this.allCommands]
    }

    public groupCommands(customCommands = new Map<string, CodyPrompt>()): void {
        const combinedMap = new Map([...this.defaultPromptsMap])
        combinedMap.set('seperator', { prompt: 'seperator' })
        this.allCommands = new Map([...combinedMap, ...customCommands])
    }

    // Main Menu: Cody Commands
    public async menu(showDesc = false): Promise<void> {
        try {
            const commandItems = [menu_seperators.chat, menu_options.chat, menu_seperators.commands]
            const allCommandItems = [...this.allCommands]?.map(commandItem => {
                const command = commandItem[1]
                if (command.prompt === 'seperator') {
                    return menu_seperators.customCommands
                }
                const description =
                    showDesc && command.slashCommand && command.type === 'default' ? command.slashCommand : command.type
                return {
                    label: command.name || commandItem[0],
                    description,
                }
            })
            commandItems.push(...allCommandItems, menu_options.config)

            // Show the list of prompts to the user using a quick pick menu
            const selectedPrompt = await vscode.window.showQuickPick([...commandItems], CodyMenu_CodyCommands)
            if (!selectedPrompt) {
                return
            }
            const selectedCommandID = selectedPrompt.label
            switch (true) {
                case !selectedCommandID:
                    break
                case selectedCommandID === menu_options.config.label:
                    return await vscode.commands.executeCommand('cody.action.commands.custom.config')
                case selectedCommandID === menu_options.chat.label:
                    return await vscode.commands.executeCommand('cody.inline.new')
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
