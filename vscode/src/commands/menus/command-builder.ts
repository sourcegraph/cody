import { type QuickPickItem, window } from 'vscode'

import type { CodyCommand } from '@sourcegraph/cody-shared'

import { CustomCommandType } from '@sourcegraph/cody-shared/src/commands/types'
import { telemetryService } from '../../services/telemetry'
import { telemetryRecorder } from '../../services/telemetry-v2'
import { fromSlashCommand } from '../utils/common'
import { customPromptsContextOptions } from './items'

export interface CustomCommandsBuilder {
    key: string
    prompt: CodyCommand
    type: CustomCommandType
}

export class CustomCommandsBuilderMenu {
    public async start(commands: string[]): Promise<CustomCommandsBuilder | null> {
        const key = await this.makeCommandKey(commands)
        if (!key) {
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

        telemetryService.log('CodyVSCodeExtension:command:custom:build:executed')
        telemetryRecorder.recordEvent('cody.command.custom.build', 'executed')
        return { key, prompt: { ...prompt, key }, type }
    }

    private async makeCommandKey(commands: string[]): Promise<string | undefined> {
        const commandSet = new Set(commands)
        const value = await window.showInputBox({
            title: 'New Custom Cody Command: Command Name',
            prompt: 'Enter the name of the custom command.',
            placeHolder: 'e.g. hello',
            ignoreFocusOut: true,
            validateInput: (input: string) => {
                if (!input) {
                    return 'Command name cannot be empty.'
                }
                if (input.split(' ').length > 1) {
                    return 'Command name cannot contain spaces. Use dashes, underscores, or camelCase.'
                }
                // Remove leading slash before checking if command already exists
                if (commandSet.has(fromSlashCommand(input))) {
                    return 'A command with the same name already exists.'
                }
                return
            },
        })

        return value
    }

    private async makePrompt(): Promise<Omit<CodyCommand, 'key'> | null> {
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

    private async addContext(newPrompt?: Partial<CodyCommand>): Promise<CodyCommand | null> {
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
            return newPrompt as CodyCommand
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

        return newPrompt as CodyCommand
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
