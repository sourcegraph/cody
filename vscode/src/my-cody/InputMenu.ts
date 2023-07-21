import * as vscode from 'vscode'

import { defaultCodyPromptContext } from '@sourcegraph/cody-shared/src/chat/recipes/my-prompt'

import { prompt_creation_title } from './helper'
import { CodyPrompt, CodyPromptType } from './types'

export type answerType = 'add' | 'file' | 'delete' | 'list' | 'open' | 'cancel'

export async function showCustomRecipeMenu(): Promise<answerType | void> {
    const options = [
        { kind: -1, label: 'recipes manager', id: 'seperator' },
        { kind: 0, label: 'Create New User Recipe', id: 'add' },
        { kind: 0, label: 'My Custom Recipes', id: 'list' },
        { kind: -1, label: '.vscode/cody.json', id: 'seperator' },
        { kind: 0, label: 'Generate Recipes Config File', id: 'file' },
        { kind: 0, label: 'Delete Recipes Config File', id: 'delete' },
        { kind: 0, label: 'Open Recipes Config File', id: 'open' },
    ]
    const inputOptions = {
        title: 'Cody Custom Recipes Main Menu',
        placeHolder: 'Select an option to continue or ESC to cancel',
    }
    const selectedOption = await vscode.window.showQuickPick(options, inputOptions)
    if (!selectedOption) {
        return
    }
    switch (selectedOption.label) {
        case 'Create New User Recipe': {
            return 'add'
        }
        case 'My Custom Recipes': {
            return 'list'
        }
        case 'Open Recipes Config File': {
            return 'open'
        }
        case 'Generate Recipes Config File': {
            return 'file'
        }
        case 'Delete Recipes Config File': {
            return 'delete'
        }
        default:
            return
    }
}

export async function recipePicker(promptList: string[] = []): Promise<string> {
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
        title: prompt_creation_title,
        prompt: 'Enter a prompt for the recipe. A prompt is a set of instructions/questions for Cody to follow and answer.',
        placeHolder: "e,g. 'Create five different test cases for the selected code''",
        validateInput: (input: string) => {
            if (!input || input.split(' ').length < minPromptLength) {
                return `Prompt cannot be empty and should be as detailed as possible. Please enter a prompt with at least ${minPromptLength} words.`
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
    const promptContext = await vscode.window.showQuickPick(contextTypes, {
        title: 'Select the context to include with the prompt for the new recipe',
        placeHolder: 'TIPS: Providing limited but precise context helps Cody provide more relevant answers',
        canPickMany: true,
        ignoreFocusOut: false,
        onDidSelectItem: (item: vscode.QuickPickItem) => {
            item.picked = !item.picked
        },
    })
    if (promptContext?.length) {
        for (const context of promptContext) {
            switch (context.id) {
                case 'selection':
                    newPrompt.context.excludeSelection = !context.picked
                    break
                case 'codebase':
                    newPrompt.context.codebase = true
                    break
                case 'currentDir':
                    newPrompt.context.currentDir = true
                    break
                case 'openTabs':
                    newPrompt.context.openTabs = true
                    break
                case 'none':
                    newPrompt.context.none = true
                    break
                case 'command': {
                    const promptCommand = await showPromptCommandInput()
                    if (promptCommand) {
                        const commandParts = promptCommand.split(' ')
                        if (commandParts.length) {
                            newPrompt.command = commandParts.shift()
                            newPrompt.args = commandParts
                        }
                        break
                    }
                }
            }
        }
    }
    return newPrompt
}

export const contextTypes = [
    {
        id: 'selection',
        label: 'Selected Code',
        detail: 'Code currently highlighted in the active editor.',
        picked: true,
    },
    {
        id: 'codebase',
        label: 'Codebase',
        detail: 'Code snippets retrieved from the available source for codebase context (embeddings or local keyword search).',
        picked: false,
    },
    {
        id: 'currentDir',
        label: 'Current Directory',
        description: 'If the prompt includes "test(s)", only test files will be included.',
        detail: 'First 10 text files in the current directory',
        picked: false,
    },
    {
        id: 'openTabs',
        label: 'Current Open Tabs',
        detail: 'First 10 text files in current open tabs',
        picked: false,
    },
    {
        id: 'command',
        label: 'Command Output',
        detail: 'The output returned from a terminal command run from your local workspace. E.g. git describe --long',
        picked: false,
    },
    {
        id: 'none',
        label: 'None',
        detail: 'Exclude all types of context.',
        picked: false,
    },
]

export async function showPromptCommandInput(): Promise<string | void> {
    // Get the command to run from the user using the input box
    const promptCommand = await vscode.window.showInputBox({
        title: prompt_creation_title,
        prompt: '[Optional] Add a terminal command for the recipe to run from your current workspace. The output will be shared with Cody as context for the prompt. (The added command must work on your local machine.)',
        placeHolder: 'e,g. node your-script.js, git describe --long, cat src/file-name.js etc.',
    })
    return promptCommand
}

export async function showPromptNameInput(myPromptStore: Map<string, CodyPrompt>): Promise<string | void> {
    const promptName = await vscode.window.showInputBox({
        title: prompt_creation_title,
        prompt: 'Enter an unique name for the new recipe.',
        placeHolder: 'e,g. Vulnerability Scanner',
        validateInput: (input: string) => {
            if (!input || input.split(' ').length < 2) {
                return 'Please enter a valid name for the recipe. A recipe name should be at least two words.'
            }
            if (myPromptStore.has(input)) {
                return 'A recipe with the same name already exists. Please enter a different name.'
            }
            return
        },
    })
    return promptName
}

export async function showRemoveConfirmationInput(): Promise<string | void> {
    const confirmRemove = await vscode.window.showWarningMessage(
        'Are you sure you want to remove .vscode/cody.json from your home directory?',
        { modal: true },
        'Yes',
        'No'
    )
    return confirmRemove
}

export async function showRecipeTypeQuickPick(
    action: 'file' | 'delete' | 'open',
    prompts: {
        user: number
        workspace: number
    }
): Promise<CodyPromptType | null> {
    const options: string[] = []
    if (action === 'file') {
        if (prompts.user === 0) {
            options.push('user')
        }
        if (prompts.workspace === 0) {
            options.push('workspace')
        }
    } else {
        if (prompts.user > 0) {
            options.push('user')
        }
        if (prompts.workspace > 0) {
            options.push('workspace')
        }
    }
    if (options.length === 0) {
        const msg =
            action === 'file'
                ? 'File for both User and Workspace Recipes already exists...'
                : 'No recipe files were found...'
        options.push(msg)
    }
    const title = 'Cody Custom Recipes - Recipe Type'
    const placeHolder = 'Select recipe type to continue...'
    // Show quick pick menu
    const recipeType = await vscode.window.showQuickPick(options, { title, placeHolder })
    if (recipeType !== 'user' && recipeType !== 'workspace') {
        return null
    }
    return recipeType
}
