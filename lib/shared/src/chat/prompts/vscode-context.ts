import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

import { ContextMessage, getContextMessageWithResponse } from '../../codebase-context/messages'
import { ActiveTextEditorSelection } from '../../editor'
import { MAX_CURRENT_FILE_TOKENS } from '../../prompt/constants'
import {
    populateCodeContextTemplate,
    populateCurrentEditorContextTemplate,
    populateCurrentSelectedCodeContextTemplate,
    populateTerminalOutputContextTemplate,
} from '../../prompt/templates'
import { truncateText } from '../../prompt/truncation'
import { getFileExtension } from '../recipes/helpers'

import { answers, displayFileName } from './templates'
import { getCurrentDirPath, getParentDirName, toJSON } from './utils'

/**
 * Gets files from a directory, optionally filtering for test files only.
 *
 * @param dirUri - The URI of the directory to get files from.
 * @param testOnly - Whether to only return test files.
 * @returns A Promise resolving to an array of [fileName, fileType] tuples.
 */
export const getFilesFromDir = async (dirUri: vscode.Uri, testOnly: boolean): Promise<[string, vscode.FileType][]> => {
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

/**
 * Gets file path context.
 *
 * @param filePath - The path of the file to get context for.
 *
 * @returns Promise that resolves to context messages for the file.
 * The context message contains the truncated file content and file name.
 */
export async function getFilePathContext(filePath: string): Promise<ContextMessage[]> {
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

/**
 * Gets context messages for terminal output.
 *
 * @param terminalOutput - The output from the terminal to add to the context.
 *
 * @returns ContextMessage[] - The context messages containing the truncated
 * terminal output.
 */
export function getTerminalOutputContext(terminalOutput: string): ContextMessage[] {
    const truncatedTerminalOutput = truncateText(terminalOutput, MAX_CURRENT_FILE_TOKENS)

    return [
        { speaker: 'human', text: populateTerminalOutputContextTemplate(truncatedTerminalOutput) },
        {
            speaker: 'assistant',
            text: answers.terminal,
        },
    ]
}

/**
 * Gets context messages for the current open file's directory.
 *
 * @param isTestOnly - Whether this is a request for test files only.
 * @returns A Promise resolving to ContextMessage[] containing file path context.
 */
export async function getCurrentDirContext(isTestOnly: boolean): Promise<ContextMessage[]> {
    // Get current open file path
    const currentFile = vscode.window.activeTextEditor?.document?.fileName

    if (!currentFile) {
        return []
    }

    const currentDir = getCurrentDirPath(currentFile)

    return getEditorDirContext(currentDir, currentFile, isTestOnly)
}

/**
 * Gets editor directory context.
 *
 * @param directoryPath - The path to the directory to get context for.
 * @param currentFileName - Optional current file name.
 * @param onlyTests - Whether to only include test files in the context.
 * Default is false.
 *
 * @returns A promise that resolves to the context messages for the directory.
 */
export async function getEditorDirContext(
    directoryPath: string,
    currentFileName?: string,
    onlyTests = false
): Promise<ContextMessage[]> {
    try {
        const directoryUri = vscode.Uri.file(directoryPath)
        const filteredFiles = await getFilesFromDir(directoryUri, onlyTests)

        const contextMessages: ContextMessage[] = []

        if (onlyTests) {
            contextMessages.push(...(await populateVscodeDirContextMessage(directoryUri, filteredFiles)))

            if (filteredFiles.length > 1) {
                return contextMessages
            }

            const parentDirectoryName = getParentDirName(directoryPath)
            const fileExtension = currentFileName ? getFileExtension(currentFileName) : '*'

            // Search for test files in directory
            const testFilesPattern = `**/{test,tests}/**/*test*.${fileExtension}`
            const testFilesContext = await getEditorFoundFilesContext(testFilesPattern)
            contextMessages.push(...testFilesContext)

            if (!contextMessages.length) {
                // Search for test files in parent directory
                const filePattern = `**/${parentDirectoryName}/**/*test*.${fileExtension}`
                const fileContext = await getEditorFoundFilesContext(filePattern)
                contextMessages.push(...fileContext)
            }

            // Return context messages if any
            if (contextMessages.length) {
                return contextMessages
            }
        }

        // Get first 10 files in directory
        const firstFiles = filteredFiles.slice(0, 10)
        return await populateVscodeDirContextMessage(directoryUri, firstFiles)
    } catch {
        return []
    }
}

export async function getEditorFoundFilesContext(globalPattern: string): Promise<ContextMessage[]> {
    const parentTestFiles = await vscode.workspace.findFiles(globalPattern, undefined, 2)
    return getContextMessageFromFiles(parentTestFiles)
}

/**
 * Gets package.json context from the workspace.
 *
 * @param filePath - Optional file path to use instead of the active text editor's file.
 * @returns A Promise resolving to ContextMessage[] containing package.json context.
 * Returns empty array if package.json is not found.
 */
export async function getPackageJsonContext(filePath?: string): Promise<ContextMessage[]> {
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

/**
 * Generates context messages for each file in a given directory.
 *
 * @param dirUri - The URI representing the directory to be analyzed.
 * @param filesInDir - An array of tuples containing the name and type of each file in the directory.
 * @returns An array of context messages, one for each file in the directory.
 */
export async function populateVscodeDirContextMessage(
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

/**
 * Gets context messages for a list of file URIs.
 *
 * @param files - The array of file URIs to get context messages for.
 * @returns A Promise resolving to an array of ContextMessage objects containing context from the files.
 */
export async function getContextMessageFromFiles(files: vscode.Uri[]): Promise<ContextMessage[]> {
    const contextMessages: ContextMessage[] = []
    for (const file of files) {
        const contextMessage = await getFilePathContext(file.fsPath)
        contextMessages.push(...contextMessage)
    }
    return contextMessages
}

/**
 * Get context messages for the currently open editor tabs.
 *
 * @param skipDirectory - Optional directory path to skip. Tabs with URIs in this directory will be skipped.
 * @returns Promise<ContextMessage[]> - Promise resolving to the array of context messages for the open tabs.
 */
export async function getEditorOpenTabsContext(skipDirectory?: string): Promise<ContextMessage[]> {
    const contextMessages: ContextMessage[] = []

    // Get open tabs
    const tabGroups = vscode.window.tabGroups.all
    const openTabs = tabGroups.flatMap(group => group.tabs.map(tab => tab.input)) as vscode.TabInputText[]

    for (const tab of openTabs) {
        // Skip non-file URIs
        if (tab.uri.scheme !== 'file') {
            continue
        }

        // Skip tabs in skipDirectory
        if (skipDirectory && tab.uri.fsPath.includes(skipDirectory)) {
            continue
        }

        // Get file name
        const fileUri = tab.uri
        const fileName = vscode.workspace.asRelativePath(fileUri.fsPath)

        // Get file content
        const fileContent = await vscode.workspace.openTextDocument(fileUri)
        const fileText = fileContent.getText()

        // Truncate file text
        const truncatedText = truncateText(fileText, MAX_CURRENT_FILE_TOKENS)

        // Create context message
        const message = getContextMessageWithResponse(
            populateCurrentEditorContextTemplate(toJSON(truncatedText), fileName),
            { fileName }
        )

        contextMessages.push(...message)
    }

    return contextMessages
}

/**
 * Get context messages for the current editor selection.
 *
 * This truncates the selected text to the max tokens, then populates context with a template
 */
export function getEditorSelectionContext(selection: ActiveTextEditorSelection): ContextMessage[] {
    const truncatedSelection = truncateText(selection.selectedText, MAX_CURRENT_FILE_TOKENS)

    return getContextMessageWithResponse(
        populateCurrentSelectedCodeContextTemplate(truncatedSelection, selection.fileName, selection.repoName),
        selection,
        answers.selection
    )
}

/**
 * Gets the display text to show for the human's input.
 *
 * If there is a selection, display the file name + range alongside with human input
 * If the workspace root is available, it generates a markdown link to the file.
 */
export function getHumanDisplayTextWithFileName(
    humanInput: string,
    selectionInfo: ActiveTextEditorSelection | null,
    workspaceRoot: URI | null
): string {
    const fileName = selectionInfo?.fileName
    if (!fileName) {
        return ''
    }

    const startLineNumber = selectionInfo?.selectionRange ? `${selectionInfo?.selectionRange?.start.line + 1}` : ''
    const fileRange = selectionInfo?.selectionRange
        ? `${selectionInfo?.selectionRange?.start.line + 1}:${selectionInfo?.selectionRange?.end.line + 1}`
        : startLineNumber

    if (!workspaceRoot) {
        return humanInput + displayFileName + fileName + fileRange
    }

    // Create markdown link to the file
    const fileUri = vscode.Uri.joinPath(workspaceRoot, fileName)
    const fileLink = `vscode://file${fileUri.fsPath}:${startLineNumber}`
    return `${humanInput}\n\nFile: [_${fileName}:${fileRange}_](${fileLink})`
}
