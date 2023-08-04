import { QuickPickItem, window } from 'vscode'

import { CodyPrompt } from '@sourcegraph/cody-shared'
import { defaultCodyPromptContext } from '@sourcegraph/cody-shared/src/chat/prompts'

import { customPromptsContextOptions } from '../utils/menu'

export const NewCustomCommandConfigMenuOptions = {
    title: 'Cody Custom Commands (Experimental) - New User Command',
}

export interface CodyCommand {
    title: string
    prompt: CodyPrompt
}
export class CustomCommandsBuilderMenu {
    constructor(private commands: Map<string, CodyPrompt>) {}

    public async start(): Promise<CodyCommand | null> {
        // get name
        const title = await this.name()
        // build prompt
        const prompt = await this.build(title)

        if (!title || !prompt) {
            return null
        }
        return { title, prompt }
    }

    private async name(): Promise<string | undefined> {
        const name = await window.showInputBox({
            ...NewCustomCommandConfigMenuOptions,
            prompt: 'Enter an unique name for the new command.',
            placeHolder: 'e,g. Vulnerability Scanner',
            validateInput: (input: string) => {
                if (!input) {
                    return 'Command name cannot be empty. Please enter a unique name.'
                }
                if (this.commands.has(input)) {
                    return 'A command with the same name exists. Please enter a different name.'
                }
                return
            },
        })
        this.commands = new Map()

        return name
    }

    private async build(promptName?: string): Promise<CodyPrompt | null> {
        if (!promptName) {
            return null
        }
        // Get the prompt description from the user using the input box
        const minPromptLength = 3
        const prompt = await window.showInputBox({
            ...NewCustomCommandConfigMenuOptions,
            prompt: 'Enter a prompt --a set of instructions/questions for Cody to follow and answer.',
            placeHolder: "e,g. 'Create five different test cases for the selected code''",
            validateInput: (input: string) => {
                if (!input || input.split(' ').length < minPromptLength) {
                    return `Please enter a prompt with min ${minPromptLength} words`
                }
                return null
            },
        })
        if (!prompt) {
            void window.showErrorMessage('Invalid values.')
            return null
        }
        return this.context({ prompt })
    }

    // Add context to the command
    private async context(newPrompt?: CodyPrompt): Promise<CodyPrompt | null> {
        if (!newPrompt) {
            return null
        }

        newPrompt.context = { ...defaultCodyPromptContext }
        // Get the context types from the user using the quick pick
        const promptContext = await window.showQuickPick(customPromptsContextOptions, {
            title: 'Select the context to include with the prompt for the new command',
            placeHolder: 'TIPS: Providing limited but precise context helps Cody provide more relevant answers',
            canPickMany: true,
            ignoreFocusOut: false,
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
                    newPrompt.context.command = (await showPromptCommandInput()) || ''
                    break
                }
            }
        }

        return newPrompt
    }
}
async function showPromptCommandInput(): Promise<string | void> {
    // Get the command to run from the user using the input box
    const promptCommand = await window.showInputBox({
        ...NewCustomCommandConfigMenuOptions,
        prompt: 'Add a terminal command to run the command locally and share the output with Cody as prompt context.',
        placeHolder: 'e,g. node your-script.js, git describe --long, cat src/file-name.js etc.',
    })
    return promptCommand
}
