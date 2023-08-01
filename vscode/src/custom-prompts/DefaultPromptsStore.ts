import * as vscode from 'vscode'

import { CodyPrompt } from '@sourcegraph/cody-shared/src/chat/recipes/cody-prompts'

import { debug } from '../log'

import * as defaultCommands from './prompts.json'

export class DefaultPromptsStore {
    private defaultPromptsMap = new Map<string, CodyPrompt>()
    private allCommands = new Map<string, CodyPrompt>()

    constructor() {
        const prompts = defaultCommands.prompts as Record<string, unknown>
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

    public getAllCommands(): [string, CodyPrompt][] {
        return [...this.allCommands]
    }

    public getDefault(): [string, CodyPrompt][] | undefined {
        return [...this.defaultPromptsMap]
    }

    public groupCommands(customCommands = new Map<string, CodyPrompt>()): void {
        this.allCommands = new Map([...this.defaultPromptsMap, ...customCommands])
    }

    // Main Menu
    public async menu(showDesc = false): Promise<void> {
        try {
            // Get the list of prompts from the cody.json file
            const commandItems: vscode.QuickPickItem[] = [{ kind: -1, label: 'commands' }]
            const allCommandItems = [...this.allCommands]?.map(commandItem => {
                const command = commandItem[1]
                if (command.prompt === 'seperator') {
                    return { kind: -1, label: command.type, description: '' }
                }
                const description = showDesc && command.slashCommand ? command.slashCommand : ''
                return {
                    label: command.name || commandItem[0],
                    description,
                }
            }) as vscode.QuickPickItem[]
            commandItems.push(...allCommandItems)
            const configSeperator: vscode.QuickPickItem = { kind: -1, label: 'custom commands' }
            const configOption: vscode.QuickPickItem = { label: 'Configure Custom Commands...' }
            const chatSeperator: vscode.QuickPickItem = { kind: -1, label: 'inline chat' }
            const chatOption: vscode.QuickPickItem = { label: 'Ask a Question', alwaysShow: true }
            commandItems.push(configSeperator, configOption, chatSeperator, chatOption)
            // Show the list of prompts to the user using a quick pick
            const options = {
                title: 'Cody Commands',
                placeHolder: 'Search for a command',
            }
            const selectedPrompt = await vscode.window.showQuickPick([...commandItems], options)
            if (!selectedPrompt) {
                return
            }
            const selectedCommandID = selectedPrompt.label
            switch (true) {
                case !selectedCommandID:
                    break
                case selectedCommandID === configOption.label:
                    return await vscode.commands.executeCommand('cody.action.custom-prompts.menu')
                case selectedCommandID === chatOption.label:
                    return await vscode.commands.executeCommand('cody.inline.new')
            }

            // Run the prompt
            const prompt = this.get(selectedCommandID)
            if (!prompt) {
                return
            }
            await vscode.commands.executeCommand('cody.customPrompts.exec', selectedCommandID)
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
