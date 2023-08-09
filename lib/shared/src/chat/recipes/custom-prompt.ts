import * as vscode from 'vscode'

import { CodebaseContext } from '../../codebase-context'
import { ContextMessage, getContextMessageWithResponse } from '../../codebase-context/messages'
import { ActiveTextEditorSelection, Editor } from '../../editor'
import {
    MAX_CURRENT_FILE_TOKENS,
    MAX_HUMAN_INPUT_TOKENS,
    MAX_RECIPE_INPUT_TOKENS,
    MAX_RECIPE_SURROUNDING_TOKENS,
    NUM_CODE_RESULTS,
    NUM_TEXT_RESULTS,
} from '../../prompt/constants'
import {
    populateCodeContextTemplate,
    populateCurrentEditorContextTemplate,
    populateCurrentSelectedCodeContextTemplate,
    populateTerminalOutputContextTemplate,
} from '../../prompt/templates'
import { truncateText, truncateTextStart } from '../../prompt/truncation'
import { CodyPromptContext, defaultCodyPromptContext } from '../prompts'
import { answers, prompts } from '../prompts/templates'
import { Interaction } from '../transcript/interaction'

import { getContextMessagesFromSelection, getFileExtension, numResults } from './helpers'
import { InlineTouch } from './inline-touch'
import { Recipe, RecipeContext, RecipeID } from './recipe'

/** ======================================================
 * Recipe for running custom prompts from the cody.json files
 * Works with VS Code only
====================================================== **/
// TODO (bee) clean up
export class CustomPrompt implements Recipe {
    public id: RecipeID = 'custom-prompt'

    /**
     * Retrieves an Interaction object based on the humanChatInput and RecipeContext provided.
     * The Interaction object contains messages from both the human and the assistant, as well as context information.
     *
     * @param humanChatInput - The input from the human user.
     * @param context - The RecipeContext object containing information about the editor, intent detector, codebase context, response multiplexer, and whether this is the first interaction.
     * @returns A Promise that resolves to an Interaction object.
     */
    public async getInteraction(humanChatInput: string, context: RecipeContext): Promise<Interaction | null> {
        // Check if context is required
        const contextConfig = await context.editor.controllers?.command?.get('context')
        const isContextRequired = contextConfig
            ? (JSON.parse(contextConfig) as CodyPromptContext)
            : defaultCodyPromptContext

        // Get prompt text from the editor command or from the human input
        const promptText = humanChatInput.trim() || (await context.editor.controllers?.command?.get()) || null
        if (!promptText) {
            const errorMsg = 'Please enter a valid prompt for the custom command.'
            return this.getInteractionWithAssistantError(errorMsg)
        }
        const promptName = await context.editor.controllers?.command?.get('current')
        const displayPromptText = promptName ? `Command: ${promptName}` : promptText

        // Check if selection is required. If selection is not defined, accept visible content
        const selectionContent =
            isContextRequired?.selection === true
                ? context.editor.getActiveTextEditorSelection()
                : context.editor.getActiveTextEditorSelectionOrVisibleContent()

        const selection = selectionContent || context.editor.controllers?.inline?.selection
        if ((isContextRequired?.selection === true || isContextRequired?.currentFile) && !selection?.selectedText) {
            const slashCommand = (await context.editor.controllers?.command?.get('slash')) || promptName
            const errorMsg = `Failed: __${slashCommand}__ requires highlighted code. Please select some code in your editor and try again.`
            return this.getInteractionWithAssistantError(errorMsg, displayPromptText)
        }

        // Get output from the command if any
        const commandOutput = await context.editor.controllers?.command?.get('output')

        // Prompt text to share with Cody only and not display to human
        const codyPromptText = prompts.instruction.replace('{humanInput}', promptText)

        // Add selection file name as display when available
        const displayText = selection?.fileName
            ? this.getHumanDisplayText(displayPromptText, selection?.fileName)
            : displayPromptText

        const truncatedText = truncateText(codyPromptText, MAX_HUMAN_INPUT_TOKENS)

        return Promise.resolve(
            new Interaction(
                { speaker: 'human', text: truncatedText, displayText },
                { speaker: 'assistant' },
                this.getContextMessages(
                    truncatedText,
                    context.editor,
                    context.codebaseContext,
                    isContextRequired,
                    selection,
                    commandOutput
                ),
                []
            )
        )
    }

    private async getInteractionWithAssistantError(errorMsg: string, displayText = ''): Promise<Interaction> {
        return Promise.resolve(
            new Interaction(
                { speaker: 'human', displayText },
                { speaker: 'assistant', displayText: errorMsg, error: errorMsg },
                Promise.resolve([]),
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
        isContextRequired: CodyPromptContext,
        selection?: ActiveTextEditorSelection | null,
        commandOutput?: string | null
    ): Promise<ContextMessage[]> {
        const contextMessages: ContextMessage[] = []

        // NONE
        if (isContextRequired.none) {
            return []
        }

        // CODEBASE CONTEXT
        if (isContextRequired.codebase) {
            const codebaseContextMessages = await codebaseContext.getContextMessages(text, numResults)
            contextMessages.push(...codebaseContextMessages)
        }

        // OPEN FILES IN EDITOR TABS
        if (isContextRequired.openTabs) {
            const openTabsContext = await CustomPrompt.getEditorOpenTabsContext()
            contextMessages.push(...openTabsContext)
        }

        // CURRENT DIRECTORTY
        if (isContextRequired.currentDir) {
            const isTestRequest = text.includes('test')
            const currentDirContext = await CustomPrompt.getCurrentDirContext(isTestRequest)
            const packageJSONContext = await CustomPrompt.getPackageJsonContext(selection?.fileName)
            contextMessages.push(...currentDirContext, ...(isTestRequest ? packageJSONContext : []))
        }

        // DIR PATH
        if (isContextRequired.directoryPath?.length) {
            const fileContext = await CustomPrompt.getEditorDirContext(
                isContextRequired.directoryPath,
                selection?.fileName
            )
            contextMessages.push(...fileContext)
        }

        // FILE PATH
        const fileContextQueue = []
        if (isContextRequired.filePath?.length) {
            const fileContext = await CustomPrompt.getFilePathContext(isContextRequired.filePath)
            fileContextQueue.push(...fileContext)
        }

        // CURRENT FILE
        const currentFileContextStack = []
        // If currentFile is true, or when selection is true but there is no selected text
        // then we want to include the current file context
        if (selection && (isContextRequired.currentFile || (isContextRequired.selection && !selection?.selectedText))) {
            const truncatedSelectedText = truncateText(selection.selectedText, MAX_RECIPE_INPUT_TOKENS)
            const truncatedPrecedingText = truncateTextStart(selection.precedingText, MAX_RECIPE_SURROUNDING_TOKENS)
            const truncatedFollowingText = truncateText(selection.followingText, MAX_RECIPE_SURROUNDING_TOKENS)
            const contextMsg = await getContextMessagesFromSelection(
                truncatedSelectedText,
                truncatedPrecedingText,
                truncatedFollowingText,
                selection,
                codebaseContext
            )
            currentFileContextStack.push(...contextMsg)
        }

        contextMessages.push(...fileContextQueue, ...currentFileContextStack)

        // SELECTED TEXT: Exclude only if selection is set to false specifically
        if (isContextRequired.selection !== false && selection?.selectedText) {
            contextMessages.push(...CustomPrompt.getEditorSelectionContext(selection))
        }

        // COMMAND OUTPUT
        if (isContextRequired.command?.length && commandOutput) {
            contextMessages.push(...CustomPrompt.getTerminalOutputContext(commandOutput))
        }

        const maxResults = Math.floor((NUM_CODE_RESULTS + NUM_TEXT_RESULTS) / 2) * 2
        return contextMessages.slice(-maxResults * 2)
    }

    public static getEditorSelectionContext(selection: ActiveTextEditorSelection): ContextMessage[] {
        const truncatedContent = truncateText(selection.selectedText, MAX_CURRENT_FILE_TOKENS)
        return getContextMessageWithResponse(
            populateCurrentSelectedCodeContextTemplate(truncatedContent, selection.fileName, selection.repoName),
            selection,
            answers.selection
        )
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
            // remove workspace root path from fileName
            const fileContent = await vscode.workspace.openTextDocument(doc.uri)
            const fileName = vscode.workspace.asRelativePath(doc.uri.fsPath)
            const truncatedContent = truncateText(fileContent.getText(), MAX_CURRENT_FILE_TOKENS)
            const docAsMessage = getContextMessageWithResponse(
                populateCurrentEditorContextTemplate(toJSON(truncatedContent), fileName),
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
            {
                speaker: 'assistant',
                text: answers.terminal,
            },
        ]
    }

    // Get context from a file path
    public static async getFilePathContext(filePath: string): Promise<ContextMessage[]> {
        const fileUri = vscode.Uri.file(filePath)
        const fileName = vscode.workspace.asRelativePath(filePath)
        try {
            const bytes = await vscode.workspace.fs.readFile(fileUri)
            const decoded = new TextDecoder('utf-8').decode(bytes)
            const truncatedContent = truncateText(decoded, MAX_CURRENT_FILE_TOKENS)
            // Make sure the truncatedContent is in JSON format
            return getContextMessageWithResponse(populateCodeContextTemplate(truncatedContent, fileName), {
                fileName,
            })
        } catch (error) {
            console.log(error)
            return []
        }
    }

    // Create Context from files within a directory
    public static async getCurrentDirContext(isTestRequest: boolean): Promise<ContextMessage[]> {
        // Get current document file path
        const currentFileName = vscode.window.activeTextEditor?.document?.fileName
        if (!currentFileName) {
            return []
        }
        const currentDirPath = getCurrentDirPath(currentFileName)
        return CustomPrompt.getEditorDirContext(currentDirPath, currentFileName, isTestRequest)
    }

    // Create Context from Current Directory of the Active Document
    // Return tests files only if testOnly is true
    /**
     * Retrieves context messages related to files in a given directory path.
     *
     * @param dirPath - The path of the directory to retrieve context messages from.
     * @param currentFileName - The name of the current file being edited.
     * @param testOnly - Flag indicating whether to only retrieve context messages related to test files.
     * @returns An array of context messages related to files in the given directory path.
     */
    public static async getEditorDirContext(
        dirPath: string,
        currentFileName?: string,
        testOnly = false
    ): Promise<ContextMessage[]> {
        try {
            const dirUri = vscode.Uri.file(dirPath)
            const filteredFiles = await getFilesFromDir(dirUri, testOnly)

            const contextMessages: ContextMessage[] = []

            if (testOnly) {
                contextMessages.push(...(await populateVscodeDirContextMessage(dirUri, filteredFiles)))

                if (filteredFiles.length > 1) {
                    return contextMessages
                }

                const parentDirName = getParentDirName(dirPath)
                const fileExt = currentFileName ? getFileExtension(currentFileName) : '*'

                // Search for files in directory with test(s) in the name
                const testDirFiles = await vscode.workspace.findFiles(
                    `**/{test,tests}/**/*test*.${fileExt}`,
                    undefined,
                    2
                )
                contextMessages.push(...(await getContextMessageFromFiles(testDirFiles)))

                if (!contextMessages.length) {
                    // Search for test files from the parent directory
                    const testFiles = await vscode.workspace.findFiles(
                        `**/${parentDirName}/**/*test*.${fileExt}`,
                        undefined,
                        2
                    )
                    contextMessages.push(...(await getContextMessageFromFiles(testFiles)))
                }

                // Return the context messages if there are any
                if (contextMessages.length) {
                    return contextMessages
                }
            }

            // Get first 10 files in the directory
            const firstNFiles = filteredFiles.slice(0, 10)
            return await populateVscodeDirContextMessage(dirUri, firstNFiles)
        } catch {
            return []
        }
    }

    // Get context from the last package.json in the current file path
    public static async getPackageJsonContext(filePath?: string): Promise<ContextMessage[]> {
        const currentFilePath = filePath || vscode.window.activeTextEditor?.document.uri.fsPath
        if (!currentFilePath) {
            return []
        }
        // Search for the package.json from the root of the repository
        const packageJsonPath = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**', 1)
        if (!packageJsonPath.length) {
            return []
        }
        try {
            const packageJsonUri = packageJsonPath[0]
            const packageJsonContent = await vscode.workspace.fs.readFile(packageJsonUri)
            const decoded = new TextDecoder('utf-8').decode(packageJsonContent)
            // Turn the content into a json and get the scripts object only
            const packageJson = JSON.parse(decoded) as Record<string, unknown>
            const scripts = packageJson.scripts
            const devDependencies = packageJson.devDependencies
            // stringify the scripts object with devDependencies
            const context = JSON.stringify({ scripts, devDependencies })
            const truncatedContent = truncateText(context.toString() || decoded.toString(), MAX_CURRENT_FILE_TOKENS)
            const fileName = vscode.workspace.asRelativePath(packageJsonUri.fsPath)
            return getContextMessageWithResponse(populateCodeContextTemplate(truncatedContent, fileName), {
                fileName,
            })
        } catch {
            return []
        }
    }
}

/**
 * Generates context messages for each file in a given directory.
 *
 * @param dirUri - The URI representing the directory to be analyzed.
 * @param filesInDir - An array of tuples containing the name and type of each file in the directory.
 * @returns An array of context messages, one for each file in the directory.
 */
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
            const fileContent = await vscode.workspace.fs.readFile(fileUri)
            const decoded = new TextDecoder('utf-8').decode(fileContent)
            const truncatedContent = truncateText(decoded, MAX_CURRENT_FILE_TOKENS)
            const contextMessage = getContextMessageWithResponse(
                populateCurrentEditorContextTemplate(toJSON(truncatedContent), fileName),
                { fileName }
            )
            contextMessages.push(...contextMessage)
        } catch (error) {
            console.error(error)
        }
    }
    return contextMessages
}

// Clean up the string to be used as value in JSON format
// Escape double quotes and backslashes and forward slashes
function toJSON(context: string): string {
    const escaped = context.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\//g, '\\/').replace('/\n//', '\n')
    return JSON.stringify(escaped)
}

// Split the directory path into parts and remove the last part to get the parent directory path
const getParentDirName = (dirPath: string): string => {
    const pathParts = dirPath.split('/')
    pathParts.pop()
    return pathParts.pop() || ''
}

// Get the current directory path from the file path
const getCurrentDirPath = (filePath: string): string => filePath?.replace(/\/[^/]+$/, '')

// Get files from a directory Uri
const getFilesFromDir = async (dirUri: vscode.Uri, testOnly: boolean): Promise<[string, vscode.FileType][]> => {
    const filesInDir = await vscode.workspace.fs.readDirectory(dirUri)

    // Filter out directories, non-test files, and dot files
    return filesInDir.filter(file => {
        const fileName = file[0]
        const fileType = file[1]
        const isDirectory = fileType === vscode.FileType.Directory
        const isHiddenFile = fileName.startsWith('.')
        const isTestFile = testOnly ? fileName.includes('test') : true

        return !isDirectory && !isHiddenFile && isTestFile
    })
}

async function getContextMessageFromFiles(files: vscode.Uri[]): Promise<ContextMessage[]> {
    const contextMessages: ContextMessage[] = []
    for (const file of files) {
        const contextMessage = await CustomPrompt.getFilePathContext(file.fsPath)
        contextMessages.push(...contextMessage)
    }
    return contextMessages
}
