import * as vscode from 'vscode'

import { CodebaseContext } from '../../codebase-context'
import { ContextMessage, getContextMessageWithResponse } from '../../codebase-context/messages'
import { ActiveTextEditorSelection, Editor } from '../../editor'
import { MAX_CURRENT_FILE_TOKENS, MAX_HUMAN_INPUT_TOKENS } from '../../prompt/constants'
import {
    populateCodeContextTemplate,
    populateCurrentEditorContextTemplate,
    populateTerminalOutputContextTemplate,
} from '../../prompt/templates'
import { truncateText } from '../../prompt/truncation'
import { Interaction } from '../transcript/interaction'

import { ChatQuestion } from './chat-question'
import { InlineTouch } from './inline-touch'
import { Recipe, RecipeContext, RecipeID } from './recipe'

// Type of context available for prompt building
export interface CodyPromptContext {
    codebase: boolean
    openTabs?: boolean
    currentDir?: boolean
    currentFile?: boolean
    excludeSelection?: boolean
    filePath?: string
    directoryPath?: string
    none?: boolean
}

export const defaultCodyPromptContext: CodyPromptContext = {
    codebase: false,
    excludeSelection: false,
}

/** ======================================================
 * Recipe for running custom prompts from the cody.json files
 * Works with VS Code only
====================================================== **/
export class MyPrompt implements Recipe {
    public id: RecipeID = 'my-prompt'
    private promptStore = new Map<string, string>()

    public async getInteraction(humanChatInput: string, context: RecipeContext): Promise<Interaction | null> {
        const selection = context.editor.getActiveTextEditorSelection() || context.editor.controllers?.inline.selection
        // Make prompt text
        const humanInput = humanChatInput.trim()
        // Match human input with key from promptStore to get prompt text when there is none
        const promptText = humanInput || this.promptStore.get(humanInput) || null
        if (!promptText) {
            await vscode.window.showErrorMessage('Please enter a valid prompt for the recipe.')
            return null
        }
        const commandOutput = context.editor.controllers?.prompt.get()
        const note = ' Refer to the command output and code I am looking at to answer my quesiton.'
        const truncatedText = truncateText(promptText + note, MAX_HUMAN_INPUT_TOKENS)
        // Add selection file name as display when available
        const displayText = selection?.fileName ? this.getHumanDisplayText(humanInput, selection?.fileName) : humanInput

        return Promise.resolve(
            new Interaction(
                { speaker: 'human', text: truncatedText, displayText },
                { speaker: 'assistant' },
                this.getContextMessages(
                    truncatedText,
                    context.editor,
                    context.codebaseContext,
                    selection,
                    commandOutput
                ),
                []
            )
        )
    }

    // Get display text for human
    private getHumanDisplayText(humanChatInput: string, fileName: string): string {
        return humanChatInput + InlineTouch.displayPrompt + fileName
    }

    private async getContextMessages(
        text: string,
        editor: Editor,
        codebaseContext: CodebaseContext,
        selection?: ActiveTextEditorSelection | null,
        commandOutput?: string | null
    ): Promise<ContextMessage[]> {
        const contextMessages: ContextMessage[] = []
        const contextConfig = editor.controllers?.prompt.get('context')
        const isContextRequired = contextConfig
            ? (JSON.parse(contextConfig) as CodyPromptContext)
            : defaultCodyPromptContext
        // Return empty array if no context is required
        if (isContextRequired.none) {
            return []
        }
        // Codebase context is not included by default
        if (isContextRequired.codebase) {
            const codebaseContextMessages = await codebaseContext.getContextMessages(text, {
                numCodeResults: 12,
                numTextResults: 3,
            })
            contextMessages.push(...codebaseContextMessages)
        }
        // Create context messages from open tabs
        if (isContextRequired.openTabs) {
            const openTabsContext = await MyPrompt.getEditorOpenTabsContext()
            contextMessages.push(...openTabsContext)
        }
        // Create context messages from current directory
        if (isContextRequired.currentDir) {
            // Select test files from the directory only if the prompt text includes 'test'
            const isTestRequest = text.includes('test')
            const currentDirContext = await MyPrompt.getCurrentDirContext(isTestRequest)
            contextMessages.push(...currentDirContext)
        }
        // Create context messages from a fsPath of a workspace directory
        if (isContextRequired.directoryPath?.length) {
            const fileContext = await MyPrompt.getEditorDirContext(isContextRequired.directoryPath)
            contextMessages.push(...fileContext)
        }
        // Create context messages from a fsPath of a file
        if (isContextRequired.filePath?.length) {
            const fileContext = await MyPrompt.getFilePathContext(isContextRequired.filePath)
            contextMessages.push(...fileContext)
        }
        // Create context messages from current file
        if (isContextRequired.currentFile) {
            contextMessages.push(...ChatQuestion.getEditorContext(editor))
        }
        // Add selected text as context when available
        if (selection?.selectedText && !isContextRequired.excludeSelection) {
            contextMessages.push(...ChatQuestion.getEditorSelectionContext(selection))
        }
        // Create context messages from terminal output if any
        if (commandOutput) {
            contextMessages.push(...MyPrompt.getTerminalOutputContext(commandOutput))
        }
        return contextMessages.slice(-12)
    }

    // Get context from current editor open tabs
    // If a fsPath is provided for a directory, skip all the matches in that directory,
    // which is helpful when used with getCurrentDirContext to avoid duplication
    public static async getEditorOpenTabsContext(dirPath?: string): Promise<ContextMessage[]> {
        const contextMessages: ContextMessage[] = []
        // Get a list of the open tabs
        const openTabs = vscode.window.tabGroups.all
        const files = openTabs.flatMap(group => group.tabs.map(tab => tab.input)) as vscode.TabInputText[]
        for (const doc of files) {
            // Skip directories
            if (doc.uri.scheme !== 'file') {
                continue
            }
            // Skip if the file is in the same directory as the current file to avoid redundancy
            if (dirPath && doc.uri.fsPath.includes(dirPath)) {
                continue
            }
            const fileName = vscode.workspace.asRelativePath(doc.uri.fsPath)
            // remove workspace root path from fileName
            const fileContent = await vscode.workspace.openTextDocument(doc.uri)
            const truncatedContent = truncateText(fileContent.getText(), MAX_CURRENT_FILE_TOKENS)
            const docAsMessage = getContextMessageWithResponse(
                populateCurrentEditorContextTemplate(truncatedContent, fileName),
                { fileName }
            )
            contextMessages.push(...docAsMessage)
        }
        return contextMessages
    }

    // Create context message for a terminal output
    public static getTerminalOutputContext(output: string): ContextMessage[] {
        const truncatedContent = truncateText(output, MAX_CURRENT_FILE_TOKENS)
        return [
            { speaker: 'human', text: populateTerminalOutputContextTemplate(truncatedContent) },
            { speaker: 'assistant', text: 'OK.' },
        ]
    }

    // Get context from a file path
    public static async getFilePathContext(filePath: string): Promise<ContextMessage[]> {
        const fileUri = vscode.Uri.file(filePath)
        const fileName = vscode.workspace.asRelativePath(filePath)
        try {
            const content = await vscode.workspace.fs.readFile(fileUri)
            const truncatedContent = truncateText(content.toString(), MAX_CURRENT_FILE_TOKENS)
            return getContextMessageWithResponse(populateCodeContextTemplate(truncatedContent, fileName), {
                fileName,
            })
        } catch (error) {
            console.error(error)
            return []
        }
    }

    // Create Context from files within a directory
    public static async getCurrentDirContext(isTestRequest: boolean): Promise<ContextMessage[]> {
        // Get current document file path
        const currentDirPath = vscode.window.activeTextEditor?.document?.fileName.replace(/\/[^/]+$/, '')
        if (!currentDirPath) {
            return []
        }
        return MyPrompt.getEditorDirContext(currentDirPath, isTestRequest)
    }

    // Create Context from Current Directory of the Active Document
    // Return tests files only if testOnly is true
    public static async getEditorDirContext(dirPath: string, testOnly?: boolean): Promise<ContextMessage[]> {
        // get a list of files from the current directory path
        const dirUri = vscode.Uri.file(dirPath)
        // Get the list of files in the current directory then filter out:
        // directories, non-test files, and dot files
        // then returns the first 10 results
        if (testOnly) {
            const filesInDir = (await vscode.workspace.fs.readDirectory(dirUri)).filter(
                file => file[1] === 1 && !file[0].startsWith('.') && (testOnly ? file[0].includes('test') : true)
            )
            // If there are no test files in the directory, use first 10 files instead
            if (filesInDir.length > 0) {
                return populateVscodeDirContextMessage(dirUri, filesInDir.slice(0, 10))
            }
        }
        // Get first 10 files in the directory
        const filesInDir = (await vscode.workspace.fs.readDirectory(dirUri))
            .filter(file => file[1] === 1 && !file[0].startsWith('.'))
            .slice(0, 10)
        return populateVscodeDirContextMessage(dirUri, filesInDir)
    }
}

async function populateVscodeDirContextMessage(
    dirUri: vscode.Uri,
    filesInDir: [string, vscode.FileType][]
): Promise<ContextMessage[]> {
    const contextMessages: ContextMessage[] = []
    for (const file of filesInDir) {
        // Get the context from each file
        const fileUri = vscode.Uri.joinPath(dirUri, file[0])
        const fileName = vscode.workspace.asRelativePath(fileUri.fsPath)
        // check file size before opening the file
        // skip file if it's larger than 1MB
        const fileSize = await vscode.workspace.fs.stat(fileUri)
        if (fileSize.size > 1000000 || !fileSize.size) {
            continue
        }
        try {
            const fileContent = await vscode.workspace.openTextDocument(fileUri)
            const truncatedContent = truncateText(fileContent.getText(), MAX_CURRENT_FILE_TOKENS)
            const contextMessage = getContextMessageWithResponse(
                populateCurrentEditorContextTemplate(truncatedContent, fileName),
                { fileName }
            )
            contextMessages.push(...contextMessage)
        } catch (error) {
            console.error(error)
        }
    }
    return contextMessages
}
