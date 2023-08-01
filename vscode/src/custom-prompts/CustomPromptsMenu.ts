import * as vscode from 'vscode'

import {
    CodyPrompt,
    CodyPromptType,
    defaultCodyPromptContext,
} from '@sourcegraph/cody-shared/src/chat/recipes/cody-prompts'

import { CodyMenu_NewCustomCommands, menu_commandTypes } from './menuOptions'
import {
    CustomPromptsContextOptions,
    CustomPromptsMainMenuOptions,
    CustomPromptsMenuAnswer,
    CustomPromptsMenuAnswerType,
} from './types'

// Main menu for the Custom Commands in Quick Pick
export async function showCustomPromptMenu(): Promise<CustomPromptsMenuAnswer | void> {
    const inputOptions = {
        title: 'Configure Custom Commands (Experimental)',
        placeHolder: 'Choose an option',
    }
    const selectedOption = await vscode.window.showQuickPick(CustomPromptsMainMenuOptions, inputOptions)
    if (!selectedOption?.id) {
        return
    }
    const actionID = selectedOption.id as CustomPromptsMenuAnswerType
    const commandType = selectedOption.type as CodyPromptType
    return { actionID, commandType }
}

// Quick pick menu to select a command from the list of available Custom Commands
export async function commandPicker(promptList: string[] = []): Promise<string> {
    const selectedRecipe = (await vscode.window.showQuickPick(promptList)) || ''
    return selectedRecipe
}

// This allows users to create a new prompt via UI using the input box and quick pick without having to manually edit the cody.json file
export async function createNewPrompt(promptName?: string): Promise<CodyPrompt | null> {
    if (!promptName) {
        return null
    }
    // Get the prompt description from the user using the input box
    const minPromptLength = 3
    const promptDescription = await vscode.window.showInputBox({
        title: CodyMenu_NewCustomCommands,
        prompt: 'Enter a prompt --a set of instructions/questions for Cody to follow and answer.',
        placeHolder: "e,g. 'Create five different test cases for the selected code''",
        validateInput: (input: string) => {
            if (!input || input.split(' ').length < minPromptLength) {
                return `Please enter a prompt with min ${minPromptLength} words`
            }
            return null
        },
    })
    if (!promptDescription) {
        void vscode.window.showErrorMessage('Invalid values.')
        return null
    }
    const newPrompt: CodyPrompt = { prompt: promptDescription }
    newPrompt.context = { ...defaultCodyPromptContext }
    // Get the context types from the user using the quick pick
    const promptContext = await vscode.window.showQuickPick(CustomPromptsContextOptions, {
        title: 'Select the context to include with the prompt for the new command',
        placeHolder: 'TIPS: Providing limited but precise context helps Cody provide more relevant answers',
        canPickMany: true,
        ignoreFocusOut: false,
        onDidSelectItem: (item: vscode.QuickPickItem) => {
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

// Input box for the user to enter a new prompt command during the UI prompt building process
export async function showPromptCommandInput(): Promise<string | void> {
    // Get the command to run from the user using the input box
    const promptCommand = await vscode.window.showInputBox({
        title: CodyMenu_NewCustomCommands,
        prompt: 'Add a terminal command to run the command locally and share the output with Cody as prompt context.',
        placeHolder: 'e,g. node your-script.js, git describe --long, cat src/file-name.js etc.',
    })
    return promptCommand
}

// Input box for the user to name the command during the UI prompt building process
export async function showPromptNameInput(myPromptStore: Map<string, CodyPrompt>): Promise<string | void> {
    const promptName = await vscode.window.showInputBox({
        title: CodyMenu_NewCustomCommands,
        prompt: 'Enter an unique name for the new command.',
        placeHolder: 'e,g. Vulnerability Scanner',
        validateInput: (input: string) => {
            if (!input) {
                return 'Recipe name cannot be empty. Please enter a unique name.'
            }
            if (myPromptStore.has(input)) {
                return 'A command with the same name exists. Please enter a different name.'
            }
            return
        },
    })
    return promptName
}

// Ask user to confirm before trying to delete the cody.json file
export async function showRemoveConfirmationInput(): Promise<string | void> {
    const confirmRemove = await vscode.window.showWarningMessage(
        'Are you sure you want to remove the .vscode/cody.json file from your file system?',
        { modal: true },
        'Yes',
        'No'
    )
    return confirmRemove
}

// Quick pick menu with the correct command type (user or workspace) selections based on existing JSON files
export async function showcommandTypeQuickPick(
    action: 'file' | 'delete' | 'open',
    prompts: {
        user: number
        workspace: number
    }
): Promise<CodyPromptType | null> {
    const options: vscode.QuickPickItem[] = []
    const userItem = menu_commandTypes.user
    const workspaceItem = menu_commandTypes.workspace
    if (action === 'file') {
        if (prompts.user === 0) {
            options.push(userItem)
        }
        if (prompts.workspace === 0) {
            options.push(workspaceItem)
        }
    } else {
        if (prompts.user > 0) {
            options.push(userItem)
        }
        if (prompts.workspace > 0) {
            options.push(workspaceItem)
        }
    }
    const title = `Cody: Custom Commands - ${action === 'file' ? 'Creating Configure File...' : 'Command Type'}`
    const placeHolder = 'Select command type (when available) to continue, or ESC to cancel'
    // Show quick pick menu
    const commandType = await vscode.window.showQuickPick(options, { title, placeHolder })
    if (!commandType?.label) {
        return null
    }
    return (commandType.label.toLowerCase() === 'user' ? 'user' : 'workspace') as CodyPromptType
}

// Ask chat question via quick input box
export async function quickChatInput(): Promise<void> {
    const humanInput = await vscode.window.showInputBox({
        prompt: 'Ask Cody a question...',
        placeHolder: 'ex. What is a class in Typescript?',
        validateInput: (input: string) => (input ? null : 'Please enter a question.'),
    })
    if (humanInput) {
        await vscode.commands.executeCommand('cody.action.chat', humanInput)
    }
}
