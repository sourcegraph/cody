import { window, type QuickPickItem } from 'vscode'

import type { CodyCommand } from '@sourcegraph/cody-shared'

import { customPromptsContextOptions } from './items'
import { CustomCommandType } from '@sourcegraph/cody-shared/src/commands/types'
import { toSlashCommand } from '../utils/common'

export interface CustomCommandsBuilder {
    slashCommand: string
    prompt: CodyCommand
    type: CustomCommandType
}

export class CustomCommandsBuilderMenu {
    public async start(commands: string[]): Promise<CustomCommandsBuilder | null> {
        const slashCommand = await this.makeSlashCommand(commands)
        if (!slashCommand) {
            return null
        }

        const description = await this.makeDescription()
        if (!description) {
            return null
        }

        const prompt = await this.makePrompt()
        if (!prompt) {
            return null
        }

        const type = await this.makeType()
        if (!type) {
            return null
        }

        return { slashCommand, prompt: { ...prompt, description, slashCommand }, type }
    }

    private async makeSlashCommand(commands: string[]): Promise<string | undefined> {
        const commandSet = new Set(commands)
        let value = await window.showInputBox({
            title: 'New Custom Cody Command: Command Name',
            prompt: 'Enter the name of the custom command',
            placeHolder: 'e.g. hello',
            ignoreFocusOut: true,
            validateInput: (input: string) => {
                if (!input) {
                    return 'Command name cannot be empty.'
                }
                if (input.split(' ').length > 1) {
                    return 'Command name cannot contain spaces. Use dashes, underscores, or camelCase.'
                }
                if (commandSet.has(toSlashCommand(input))) {
                    return 'A command with the same name already exists.'
                }
                return
            },
        })
        if (value) {
            value = toSlashCommand(value)
        }
        return value
    }

    private async makeDescription(): Promise<string | undefined> {
        const description = await window.showInputBox({
            title: 'New Custom Cody Command: Description',
            prompt: 'Enter a description for the command in sentence case.',
            placeHolder: 'e.g. Scan for vulnerabilities',
            ignoreFocusOut: true,
            validateInput: (input: string) => {
                if (!input) {
                    return 'Command description cannot be empty.'
                }
                return
            },
        })
        return description
    }

    private async makePrompt(): Promise<Omit<CodyCommand, 'slashCommand'> | null> {
        const prompt = await window.showInputBox({
            title: 'New Custom Cody Command: Prompt',
            prompt: 'Enter the instructions for Cody to follow and answer.',
            placeHolder: 'e.g. Create five different test cases for the selected code',
            ignoreFocusOut: true,
            validateInput: (input: string) => {
                if (!input) {
                    return 'Command prompt cannot be empty.'
                }
                return null
            },
        })
        if (!prompt) {
            return null
        }
        return this.addContext({ prompt })
    }

    private async addContext(
        newPrompt?: Omit<CodyCommand, 'slashCommand'>
    ): Promise<Omit<CodyCommand, 'slashCommand'> | null> {
        if (!newPrompt) {
            return null
        }

        newPrompt.context = { ...{ codebase: false } }
        const promptContext = await window.showQuickPick(customPromptsContextOptions, {
            title: 'New Custom Cody Command: Context Options',
            placeHolder: 'For accurate responses, choose only the necessary options.',
            canPickMany: true,
            ignoreFocusOut: true,
            onDidSelectItem: (item: QuickPickItem) => {
                item.picked = !item.picked
            },
        })

        if (!promptContext?.length) {
            return newPrompt
        }

        for (const context of promptContext) {
            switch (context.id) {
                case 'selection':
                case 'currentDir':
                case 'openTabs':
                case 'none':
                    newPrompt.context[context.id] = context.picked
                    break
                case 'command': {
                    newPrompt.context.command = (await showPromptCreationInputBox()) || ''
                    break
                }
            }
        }

        return newPrompt
    }

    private async makeType(): Promise<CustomCommandType> {
        const option = await window.showQuickPick(
            [
                {
                    label: 'User Settings',
                    detail: 'Stored on your machine and usable across all your workspaces/repositories',
                    type: CustomCommandType.User,
                    description: '~/.vscode/cody.json',
                    picked: true,
                },
                {
                    label: 'Workspace Settings',
                    detail: 'Project-specific and shared with anyone using this workspace/repository',
                    type: CustomCommandType.Workspace,
                    description: '.vscode/cody.json',
                },
            ],
            {
                title: 'New Custom Cody Command: Save To…',
                ignoreFocusOut: true,
                placeHolder: 'Choose where to save the command',
            }
        )

        return option?.type === CustomCommandType.Workspace
            ? CustomCommandType.Workspace
            : CustomCommandType.User
    }
}

async function showPromptCreationInputBox(): Promise<string | undefined> {
    const promptCommand = await window.showInputBox({
        title: 'New Custom Cody Command: Command',
        prompt: 'Enter the terminal command to run from the workspace root. Its output will be included to Cody as prompt context.',
        placeHolder: 'e.g. node myscript.js | head -n 50',
    })
    return promptCommand
}
