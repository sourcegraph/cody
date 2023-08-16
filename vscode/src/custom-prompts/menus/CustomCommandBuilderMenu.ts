import { QuickPickItem, window } from 'vscode'

import { CodyPrompt } from '@sourcegraph/cody-shared'
import { defaultCodyPromptContext } from '@sourcegraph/cody-shared/src/chat/prompts'

import { customPromptsContextOptions } from '../utils/menu'

const NewCustomCommandConfigMenuOptions = {
    title: 'Cody Custom Commands (Experimental) - New User Command',
}

export interface CodyCommand {
    title: string
    prompt: CodyPrompt
}
export class CustomCommandsBuilderMenu {
    public async start(commands: Map<string, CodyPrompt>): Promise<CodyCommand | null> {
        // get name
        const title = await this.makeName(commands)
        // build prompt
        const prompt = await this.makePrompt(title)

        if (!title || !prompt) {
            return null
        }
        void window.showInformationMessage(`New command: ${title} created successfully.`)
        return { title, prompt }
    }

    private async makeName(commands: Map<string, CodyPrompt>): Promise<string | undefined> {
        const name = await window.showInputBox({
            ...NewCustomCommandConfigMenuOptions,
            prompt: 'Enter an unique name for the new command.',
            placeHolder: 'e,g. Vulnerability Scanner',
            ignoreFocusOut: true,
            validateInput: (input: string) => {
                if (!input) {
                    return 'Command name cannot be empty. Please enter a unique name.'
                }
                if (commands.has(input)) {
                    return 'A command with the same name exists. Please enter a different name.'
                }
                return
            },
        })
        return name
    }

    private async makePrompt(promptName?: string): Promise<CodyPrompt | null> {
        if (!promptName) {
            return null
        }
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
    private async addContext(newPrompt?: CodyPrompt): Promise<CodyPrompt | null> {
        if (!newPrompt) {
            return null
        }

        newPrompt.context = { ...defaultCodyPromptContext }
        // Get the context types from the user using the quick pick
        const promptContext = await window.showQuickPick(customPromptsContextOptions, {
            title: 'Select the context to include with the prompt for the new command',
            placeHolder: 'Tip: Providing limited but precise context helps Cody provide more relevant answers',
            canPickMany: true,
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

        // Assign slash command
        const promptSlashCommand = await showPromptCreationInputBox(slashCommandPrompt)
        if (promptSlashCommand) {
            newPrompt.slashCommand = promptSlashCommand
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

const slashCommandPrompt = {
    prompt: 'ESC to skip, or enter a keyword to turn this command into a slash command that you can run in chat',
    placeHolder: 'e.g. "explain" to assign /explain for the "Explain Code" command',
}
