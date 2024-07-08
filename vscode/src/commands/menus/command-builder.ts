import { type QuickPickItem, window } from 'vscode'

import type { CodyCommand } from '@sourcegraph/cody-shared'

import { type CodyCommandMode, CustomCommandType } from '@sourcegraph/cody-shared'
import { telemetryRecorder } from '@sourcegraph/cody-shared'
import { fromSlashCommand } from '../utils/common'
import { CommandModeMenuOptions, customPromptsContextOptions } from './items/menu'

export interface CustomCommandsBuilder {
    key: string
    prompt: CodyCommand
    type: CustomCommandType
}

export class CustomCommandsBuilderMenu {
    /**
     * Starts the process of creating a new custom Cody command.
     *
     * This method prompts the user to enter a command name, select a command mode, and enter a prompt for Cody to follow.
     * If all the required information is provided, it returns a `CustomCommandsBuilder` object that can be used to create the new custom command.
     *
     * @param commands - An array of existing command names to check for duplicates.
     * @returns A `CustomCommandsBuilder` object if the command creation process is successful, or `null` if the user cancels or the input is invalid.
     */
    public async start(commands: string[]): Promise<CustomCommandsBuilder | null> {
        const key = await this.makeCommandKey(commands)
        const mode = key && (await this.selectCommandMode())
        const prompt = mode && (await this.getCommandPrompt())
        const type = prompt && (await this.selectCommandType())

        if (key && mode && prompt && type) {
            telemetryRecorder.recordEvent('cody.command.custom.build', 'executed')

            return { key, prompt: { ...prompt, key, mode }, type }
        }

        return null
    }

    /**
     * STEP 1: Make a new command key
     * Prompts the user to enter a name for a new custom Cody command, validating that the name is not empty and does not contain spaces.
     * It also checks that the command name does not already exist in the list of commands.
     *
     * @param commands - An array of existing command names.
     * @returns The new command name entered by the user, or `undefined` if the user cancels the input.
     */
    private async makeCommandKey(commands: string[]): Promise<string | undefined> {
        const commandSet = new Set(commands)
        const value = await window.showInputBox({
            title: 'New Custom Cody Command: Command Name',
            prompt: 'Enter a unique keyword for the command.',
            placeHolder: 'e.g. spellchecker',
            ignoreFocusOut: true,
            validateInput: (input: string) => {
                if (!input) {
                    return 'Command name cannot be empty.'
                }
                if (input.split(' ').length > 1) {
                    return 'Command name cannot contain spaces. Use dashes, underscores, or camelCase.'
                }
                // Remove leading slash before checking if command already exists
                if (commandSet.has(fromSlashCommand(input).toString())) {
                    return 'A command with the same name already exists.'
                }
                return
            },
        })

        return value
    }

    /**
     * STEP 2: Select a command mode
     * Displays a quick pick menu to allow the user to select a command mode for a new custom Cody command.
     * The command mode determines how the command will be executed, such as whether it should run in the current context or in a separate process.
     *
     * @returns The selected command mode, or `undefined` if the user cancels the selection.
     */
    private async selectCommandMode(): Promise<CodyCommandMode | undefined> {
        const commandMode = await window.showQuickPick(CommandModeMenuOptions, {
            title: 'New Custom Cody Command: Command Mode',
            placeHolder: 'Choose how the command should be executed...',
            canPickMany: false,
            onDidSelectItem: (item: QuickPickItem) => {
                item.picked = !item.picked
            },
        })

        return commandMode ? (commandMode.id as CodyCommandMode) : undefined
    }

    /**
     * STEP 3: Enter a new prompt for the command
     * Prompts the user to enter a new custom Cody command prompt and adds the necessary context options for the command.
     *
     * @returns The new custom Cody command with the prompt and context, or `null` if the user cancels the operation.
     */
    private async getCommandPrompt(): Promise<Omit<CodyCommand, 'key'> | null> {
        const prompt = await window.showInputBox({
            title: 'New Custom Cody Command: Prompt',
            prompt: 'Enter the instructions for Cody to follow and answer.',
            placeHolder: 'e.g. Create five different test cases for the selected code',
            ignoreFocusOut: true,
            validateInput: (input: string) => (input.length ? null : 'Command prompt cannot be empty.'),
        })
        return prompt ? this.addContext({ prompt }) : null
    }

    /**
     * STEP 4: Add context to the new Cody command
     * Adds context options to the new Cody command.
     * This function allows the user to select which context options to include in the new Cody command. The available context options are:
     * - Selection: Include the current text selection in the prompt context.
     * - Current Directory: Include the current working directory in the prompt context.
     * - Open Tabs: Include the currently open tabs in the prompt context.
     * - None: Include no additional context in the prompt.
     * - Command: Allow the user to enter a terminal command to run from the workspace root, and include its output in the prompt context.
     *
     * If the user does not select any context options, the function will return the new Cody command without any additional context.
     *
     * @param newPrompt - The new Cody command to add context to.
     * @returns The new Cody command with the selected context options, or null if no prompt was provided.
     */
    private async addContext(newPrompt: Partial<CodyCommand>): Promise<CodyCommand | null> {
        const promptContext = await window.showQuickPick(customPromptsContextOptions, {
            title: 'New Custom Cody Command: Context Options',
            placeHolder: 'For accurate responses, choose only the necessary options.',
            canPickMany: true,
            ignoreFocusOut: true,
            onDidSelectItem: (item: QuickPickItem) => {
                item.picked = !item.picked
            },
        })

        if (promptContext !== undefined) {
            newPrompt.context = { selection: false }
            for (const context of promptContext) {
                switch (context.id) {
                    case 'selection':
                    case 'currentFile':
                    case 'currentDir':
                    case 'openTabs':
                    case 'none':
                        newPrompt.context[context.id] = context.picked
                        break
                    case 'command': {
                        newPrompt.context.command = (await showPromptCreationInputBox()) ?? undefined
                        break
                    }
                }
            }
        }

        return newPrompt as CodyCommand
    }

    /**
     * STEP 5: Save the new Cody command
     * Prompts the user to choose whether to save a custom Cody command to the user or workspace settings.
     * @returns A promise that resolves to the chosen `CustomCommandType`.
     */
    private async selectCommandType(): Promise<CustomCommandType> {
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

        if (!option?.type) {
            throw new Error('Custom Command creation aborted.')
        }

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
