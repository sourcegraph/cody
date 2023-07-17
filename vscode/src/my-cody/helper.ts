import * as vscode from 'vscode'

import { defaultCodyPromptContext } from '@sourcegraph/cody-shared/src/chat/recipes/my-prompt'

import { CodyPrompt } from './MyPromptController'

export async function createJSONFile(extensionPath: string, rootDirPath: string, isUserType: boolean): Promise<void> {
    const extensionUri = vscode.Uri.parse(extensionPath)
    const refFileName = isUserType ? 'user-cody.json' : 'workspace-cody.json'
    const codyJsonPath = vscode.Uri.joinPath(extensionUri, 'resources/bin/' + refFileName)
    const bytes = await vscode.workspace.fs.readFile(codyJsonPath)
    const decoded = new TextDecoder('utf-8').decode(bytes)
    if (!rootDirPath) {
        void vscode.window.showErrorMessage('Failed to create cody.json file.')
        return
    }
    await saveJSONFile(decoded, rootDirPath)
}

export async function saveJSONFile(context: string, rootDirPath: string, isSaveMode = false): Promise<void> {
    const rootDirUri = vscode.Uri.parse(rootDirPath)
    const codyJsonFilePath = vscode.Uri.joinPath(rootDirUri, '.vscode/cody.json')
    const workspaceEditor = new vscode.WorkspaceEdit()
    // Clear the file before writing to it
    workspaceEditor.deleteFile(codyJsonFilePath, { ignoreIfNotExists: true })
    workspaceEditor.createFile(codyJsonFilePath, { ignoreIfExists: isSaveMode })
    workspaceEditor.insert(codyJsonFilePath, new vscode.Position(0, 0), context)
    await vscode.workspace.applyEdit(workspaceEditor)
    // Save the file
    const doc = await vscode.workspace.openTextDocument(codyJsonFilePath)
    await doc.save()
    if (!isSaveMode) {
        await vscode.window.showTextDocument(codyJsonFilePath)
    }
}

export function createFileWatch(fsPath?: string): vscode.FileSystemWatcher | null {
    if (!fsPath) {
        return null
    }
    const fileName = '.vscode/cody.json'
    const watchPattern = new vscode.RelativePattern(fsPath, fileName)
    const watcher = vscode.workspace.createFileSystemWatcher(watchPattern)
    return watcher
}

export const prompt_creation_title = 'Creating a new custom recipe...'

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
        title: 'Select context type to share with Cody for the new recipe',
        canPickMany: true,
        ignoreFocusOut: true,
        onDidSelectItem: (item: vscode.QuickPickItem) => {
            item.picked = !item.picked
            console.log(item)
        },
    })
    if (promptContext?.length) {
        for (const context of promptContext) {
            switch (context.id) {
                case 'selection':
                    newPrompt.context.excludeSelection = false
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
            }
        }
    } else {
        newPrompt.context.none = true
        newPrompt.context.excludeSelection = true
    }
    // Get the command to run from the user using the input box
    const promptCommand = await vscode.window.showInputBox({
        title: prompt_creation_title,
        prompt: '[Optional] Add a terminal command for the recipe to run from your current workspace. The output will be shared with Cody as context for the prompt. (The added command must work on your local machine.)',
        placeHolder: 'e,g. node your-script.js, git describe --long, cat src/file-name.js etc.',
    })
    if (promptCommand) {
        const commandParts = promptCommand.split(' ')
        if (!commandParts.length) {
            return null
        }
        newPrompt.command = commandParts.shift()
        newPrompt.args = commandParts
    }
    return newPrompt
}

const contextTypes = [
    {
        id: 'selection',
        label: 'Selected Code',
        detail: 'The code that you are currently selected in the editor.',
        picked: true,
    },
    {
        id: 'codebase',
        label: 'Codebase',
        detail: 'Code snippests from embeddings.',
        picked: false,
    },
    {
        id: 'currentDir',
        label: 'Current Directory',
        description: 'Text files only',
        detail: 'Files in the current directory.',
        picked: false,
    },
    {
        id: 'openTabs',
        label: 'Current Open Tabs',
        description: 'Text files only',
        detail: 'Files in current open tabs.',
        picked: false,
    },
]
