import { QuickPickItem, window } from 'vscode'

import { CodyPrompt } from '@sourcegraph/cody-shared'
import { defaultCodyPromptContext } from '@sourcegraph/cody-shared/src/chat/prompts'
import { toSlashCommand } from '@sourcegraph/cody-shared/src/chat/prompts/utils'

import { customPromptsContextOptions } from '../utils/menu'

const NewCustomCommandConfigMenuOptions = {
    title: 'Cody Custom Commands (Experimental) - New User Command',
}

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
        if (!slashCommand || !description || !prompt) {
            return null
        }
        void window.showInformationMessage(`New command: ${description} created successfully.`)
        return { slashCommand, prompt: { ...prompt, description, slashCommand } }
    }

    private async makeSlashCommand(commands: Map<string, CodyPrompt>): Promise<string | undefined> {
        let value = await window.showInputBox({
            ...NewCustomCommandConfigMenuOptions,
            prompt: 'Enter a keyword for this command to act as a slash command that you can run in chat or main quick pick.',
            placeHolder: 'e.g. "explain" to assign /explain for the "Explain Code" command',
            ignoreFocusOut: true,
            validateInput: (input: string) => {
                if (!input) {
                    return 'Slash command cannot be empty. Please enter a unique keyword.'
                }
                if (commands.has(input)) {
                    return 'A command with the same keyword exists. Please enter a different command name.'
                }
                if (input.split(' ').length > 1) {
                    return 'A command cannot contain spaces. You can use dashes, underscores, camelCase, etc. instead.'
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
            ...NewCustomCommandConfigMenuOptions,
            prompt: 'Enter description for the new command.',
            placeHolder: 'e,g. Vulnerability Scanner',
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
            ...NewCustomCommandConfigMenuOptions,
            prompt: 'Enter a prompt—a set of instructions/questions for Cody to follow and answer.',
            placeHolder: "e.g. 'Create five different test cases for the selected code'",
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
            title: 'Select the context to include with the prompt for the new command',
            placeHolder: 'Tip: Providing limited but precise context helps Cody provide more relevant answers',
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
                    newPrompt.context.command = (await showPromptCreationInputBox(inputPrompt)) || ''
                    break
                }
            }
        }

        return newPrompt
    }
}

async function showPromptCreationInputBox(args: { prompt: string; placeHolder: string }): Promise<string | void> {
    // Get the command to run from the user using the input box
    const promptCommand = await window.showInputBox({
        ...NewCustomCommandConfigMenuOptions,
        ...args,
    })
    return promptCommand
}

const inputPrompt = {
    prompt: 'Add a terminal command to run the command locally and share the output with Cody as prompt context.',
    placeHolder: 'e.g. node your-script.js, git describe --long, cat src/file-name.js etc.',
}
