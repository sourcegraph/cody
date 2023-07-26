import * as vscode from 'vscode'

import { defaultCodyPromptContext } from '@sourcegraph/cody-shared/src/chat/recipes/my-prompt'

import { CodyPrompt, CodyPromptType, CustomRecipesContextOptions, CustomRecipesMainMenuOptions } from './const'
import { prompt_creation_title } from './helper'

export type CustomRecipesMenuAnswerType = 'add' | 'file' | 'delete' | 'list' | 'open' | 'cancel'

export interface CustomRecipesMenuAnswer {
    actionID: CustomRecipesMenuAnswerType
    recipeType: CodyPromptType
}

// Main menu for the Custom Recipes in Quick Pick
export async function showCustomRecipeMenu(): Promise<CustomRecipesMenuAnswer | void> {
    const inputOptions = {
        title: 'Cody: Custom Recipes (Experimental)',
        placeHolder: 'Select an option to continue or ESC to cancel',
    }
    const selectedOption = await vscode.window.showQuickPick(CustomRecipesMainMenuOptions, inputOptions)
    if (!selectedOption?.id || selectedOption.id === 'seperator' || selectedOption.id === 'cancel') {
        return
    }
    const actionID = selectedOption.id as CustomRecipesMenuAnswerType
    const recipeType = selectedOption.type as CodyPromptType
    return { actionID, recipeType }
}

// Quick pick menu to select a recipe from the list of available custom recipes
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
    const promptContext = await vscode.window.showQuickPick(CustomRecipesContextOptions, {
        title: 'Select the context to include with the prompt for the new recipe',
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
                newPrompt.context.excludeSelection = !context.picked
                break
            case 'codebase':
            case 'currentDir':
            case 'openTabs':
            case 'none':
                newPrompt.context[context.id] = true
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
        title: prompt_creation_title,
        prompt: 'Add a terminal command to run the recipe locally and share the output with Cody as prompt context.',
        placeHolder: 'e,g. node your-script.js, git describe --long, cat src/file-name.js etc.',
    })
    return promptCommand
}

// Input box for the user to name the recipe during the UI prompt building process
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

// Quick pick menu with the correct recipe type (user or workspace) selections based on existing JSON files
export async function showRecipeTypeQuickPick(
    action: 'file' | 'delete' | 'open',
    prompts: {
        user: number
        workspace: number
    }
): Promise<CodyPromptType | null> {
    const options: vscode.QuickPickItem[] = []
    const userItem = {
        label: 'User',
        detail: 'User Recipes are accessible only to you across Workspaces',
        description: '~/.vscode/cody.json',
    }
    const workspaceItem = {
        label: 'Workspace',
        detail: 'Workspace Recipes are available to all users in your current repository',
        description: '.vscode/cody.json',
    }
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
    if (options.length === 0) {
        const msg =
            action === 'file'
                ? 'File for both User and Workspace Recipes already exists...'
                : 'No recipe files were found...'
        options.push({ label: msg })
    }
    const title = `Cody: Custom Recipes - ${action === 'file' ? 'Creating Config File' : 'Recipe Type'}`
    const placeHolder = 'Select recipe type to continue or ESC to cancel'
    // Show quick pick menu
    const recipeType = await vscode.window.showQuickPick(options, { title, placeHolder })
    if (!recipeType?.label) {
        return null
    }
    return recipeType.label.toLowerCase() as CodyPromptType
}
