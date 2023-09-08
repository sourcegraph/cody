import { QuickPickItem, window } from 'vscode'

import { CodyPrompt } from '@sourcegraph/cody-shared'
import { defaultCodyPromptContext } from '@sourcegraph/cody-shared/src/chat/prompts'
import { toSlashCommand } from '@sourcegraph/cody-shared/src/chat/prompts/utils'

import { customPromptsContextOptions } from '../utils/menu'

export interface CodyCommand {
    slashCommand: string
    prompt: CodyPrompt
}
export class CustomCommandsBuilderMenu {
    public async start(commands: Map<string, CodyPrompt>): Promise<CodyCommand | null> {
        // get slash command
        const slashCommand = await this.makeSlashCommand(commands)
        // get name
        const description = await this.makeDescription()
        // build prompt
        const prompt = await this.makePrompt()
        // get type
        if (prompt) {
            prompt.type = await this.makeType()
        }

        if (!slashCommand || !description || !prompt || !prompt.type) {
            return null
        }

        return { slashCommand, prompt: { ...prompt, description, slashCommand } }
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
                if (commands.has(input)) {
                    return 'A command with the slash name already exists.'
                }
                if (input.split(' ').length > 1) {
                    return 'Slash name cannot contain spaces. Use dashes, underscores, or camelCase.'
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
        const name = await window.showInputBox({
            title: 'New Custom Cody Command: Description',
            prompt: 'Enter a description for the command.',
            placeHolder: 'e.g. Vulnerability Scanner',
            ignoreFocusOut: true,
            validateInput: (input: string) => {
                if (!input) {
                    return 'Command description cannot be empty.'
                }
                return
            },
        })
        return name
    }

    private async makePrompt(): Promise<Omit<CodyPrompt, 'slashCommand'> | null> {
        // Get the prompt description from the user using the input box
        const minPromptLength = 3
        const prompt = await window.showInputBox({
            title: 'New Custom Cody Command: Prompt',
            prompt: 'Enter the instructions for Cody to follow and answer.',
            placeHolder: 'e.g. Create five different test cases for the selected code',
            ignoreFocusOut: true,
            validateInput: (input: string) => {
                if (!input || input.split(' ').length < minPromptLength) {
                    return `Please enter a prompt with a minimum of ${minPromptLength} words`
                }
                return null
            },
        })
        if (!prompt) {
            void window.showErrorMessage('Prompt is required and cannot be empty.')
            return null
        }
        return this.addContext({ prompt })
    }

    // Add context to the command
    private async addContext(
        newPrompt?: Omit<CodyPrompt, 'slashCommand'>
    ): Promise<Omit<CodyPrompt, 'slashCommand'> | null> {
        if (!newPrompt) {
            return null
        }

        newPrompt.context = { ...defaultCodyPromptContext }
        // Get the context types from the user using the quick pick
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

    private async makeType(): Promise<'user' | 'workspace'> {
        const option = await window.showQuickPick(
            [
                {
                    label: 'User Settings',
                    detail: 'Stored on your machine and usable across all your workspaces',
                    type: 'user',
                    description: '~/.vscode/cody.json',
                    picked: true,
                },
                {
                    label: 'Workspace Settings',
                    detail: 'Project-specific and shared with anyone using this workspace/repo',
                    type: 'workspace',
                    description: '.vscode/cody.json',
                },
            ],
            {
                title: 'New Custom Cody Command: Save to…',
                ignoreFocusOut: true,
            }
        )

        return option?.type === 'workspace' ? 'workspace' : 'user'
    }
}

async function showPromptCreationInputBox(): Promise<string | void> {
    // Get the command to run from the user using the input box
    const promptCommand = await window.showInputBox({
        title: 'New Custom Cody Command: Command',
        prompt: 'Enter the terminal command to run from the workspace root. Its output will be included to Cody as prompt context.',
        placeHolder: 'e.g. git describe --long',
    })
    return promptCommand
}
