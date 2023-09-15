import { QuickPickItem, window } from 'vscode'

import { CodyPrompt } from '@sourcegraph/cody-shared'
import { CustomCommandType, defaultCodyPromptContext } from '@sourcegraph/cody-shared/src/chat/prompts'
import { toSlashCommand } from '@sourcegraph/cody-shared/src/chat/prompts/utils'

import { customPromptsContextOptions } from '../utils/menu'

export interface CodyCommand {
    slashCommand: string
    prompt: CodyPrompt
    type: CustomCommandType
}
export class CustomCommandsBuilderMenu {
    public async start(commands: Map<string, CodyPrompt>): Promise<CodyCommand | null> {
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

    private async makeSlashCommand(commands: Map<string, CodyPrompt>): Promise<string | undefined> {
        let value = await window.showInputBox({
            title: 'New Custom Cody Command: Slash Name',
            prompt: 'Enter the slash name of the custom command',
            placeHolder: 'e.g. /my-custom-command',
            ignoreFocusOut: true,
            validateInput: (input: string) => {
                if (!input) {
                    return 'Slash name cannot be empty.'
                }
                if (input.split(' ').length > 1) {
                    return 'Slash name cannot contain spaces. Use dashes, underscores, or camelCase.'
                }
                if (commands.has(toSlashCommand(input))) {
                    return 'A command with the slash name already exists.'
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

    private async makePrompt(): Promise<Omit<CodyPrompt, 'slashCommand'> | null> {
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
        newPrompt?: Omit<CodyPrompt, 'slashCommand'>
    ): Promise<Omit<CodyPrompt, 'slashCommand'> | null> {
        if (!newPrompt) {
            return null
        }

        newPrompt.context = { ...defaultCodyPromptContext }
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
                case 'codebase':
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
                    type: 'user',
                    description: '~/.vscode/cody.json',
                    picked: true,
                },
                {
                    label: 'Workspace Settings',
                    detail: 'Project-specific and shared with anyone using this workspace/repository',
                    type: 'workspace',
                    description: '.vscode/cody.json',
                },
            ],
            {
                title: 'New Custom Cody Command: Save To…',
                ignoreFocusOut: true,
                placeHolder: 'Choose where to save the command',
            }
        )

        return option?.type === 'workspace' ? 'workspace' : 'user'
    }
}

async function showPromptCreationInputBox(): Promise<string | void> {
    const promptCommand = await window.showInputBox({
        title: 'New Custom Cody Command: Command',
        prompt: 'Enter the terminal command to run from the workspace root. Its output will be included to Cody as prompt context.',
        placeHolder: 'e.g. node myscript.js | head -n 50',
    })
    return promptCommand
}
