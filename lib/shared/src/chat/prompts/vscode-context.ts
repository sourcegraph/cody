import { dirname } from 'path'

import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

import { ContextMessage, getContextMessageWithResponse } from '../../codebase-context/messages'
import { ActiveTextEditorSelection } from '../../editor'
import { MAX_CURRENT_FILE_TOKENS } from '../../prompt/constants'
import {
    populateCodeContextTemplate,
    populateContextTemplateFromText,
    populateCurrentEditorContextTemplate,
    populateCurrentFileFromEditorSelectionContextTemplate,
    populateCurrentSelectedCodeContextTemplate,
    populateListOfFilesContextTemplate,
    populateTerminalOutputContextTemplate,
} from '../../prompt/templates'
import { truncateText } from '../../prompt/truncation'
import { getFileExtension } from '../recipes/helpers'

import { answers, displayFileName } from './templates'
import { getFileNameFromPath, isValidTestFileName } from './utils'

// TODO bee move vscode logic to editor and context creating to share lib
/**
 * Checks if a file URI is part of the current workspace.
 *
 * @param fileToCheck - The file URI to check
 * @returns True if the file URI belongs to a workspace folder, false otherwise
 */
export function isInWorkspace(fileToCheck: URI): boolean {
    return vscode.workspace.getWorkspaceFolder(fileToCheck) !== undefined
}

/**
 * Gets files from a directory, optionally filtering for test files only.
 *
 * @param dirUri - The URI of the directory to get files from.
 * @param testFilesOnly - Whether to only return file names with test in it.
 * @returns A Promise resolving to an array of [fileName, fileType] tuples.
 */
export const getFilesFromDir = async (
    dirUri: vscode.Uri,
    testFilesOnly: boolean
): Promise<[string, vscode.FileType][]> => {
    try {
        const filesInDir = await vscode.workspace.fs.readDirectory(dirUri)

        // Filter out directories, non-test files, and dot files
        return filesInDir.filter(file => {
            const fileName = file[0]
            const fileType = file[1]
            const isDirectory = fileType === vscode.FileType.Directory
            const isHiddenFile = fileName.startsWith('.')
            const isATestFile = testFilesOnly ? isValidTestFileName(fileName) : true

            return !isDirectory && !isHiddenFile && isATestFile
        })
    } catch (error) {
        console.error(error)
        return []
    }
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
        console.error(error)
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
 * @param isUnitTestRequest - Whether this is a request for test files only.
 * @returns A Promise resolving to ContextMessage[] containing file path context.
 */
export async function getCurrentDirContext(isUnitTestRequest: boolean): Promise<ContextMessage[]> {
    // Get current open file path
    const currentFile = vscode.window.activeTextEditor?.document?.fileName

    if (!currentFile) {
        return []
    }

    const currentDir = dirname(currentFile)

    return getEditorDirContext(currentDir, currentFile, isUnitTestRequest)
}

export async function getEditorDirContext(
    directoryPath: string,
    currentFileName?: string,
    isUnitTestRequest = false
): Promise<ContextMessage[]> {
    const directoryUri = vscode.Uri.file(directoryPath)
    const filteredFiles = await getFilesFromDir(directoryUri, isUnitTestRequest)

    if (isUnitTestRequest && currentFileName) {
        const context = await getCurrentDirFilteredContext(directoryUri, filteredFiles, currentFileName)
        if (context.length > 0) {
            return context
        }

        const testFileContext = await getEditorTestContext(currentFileName, isUnitTestRequest)
        if (testFileContext.length > 0) {
            return testFileContext
        }
    }

    // Default to first 10 files
    const firstFiles = filteredFiles.slice(0, 10)
    return getDirContextMessages(directoryUri, firstFiles)
}

export async function getEditorTestContext(fileName: string, isUnitTestRequest = false): Promise<ContextMessage[]> {
    const currentTestFile = await getCurrentTestFileContext(fileName)
    const codebaseTestFiles = await getCodebaseTestFilesContext(fileName, isUnitTestRequest)
    return [...codebaseTestFiles, ...currentTestFile]
}

// Get context for test file in current directory
// TODO bee find matches using regex based on language
export async function getCurrentTestFileContext(fileName: string): Promise<ContextMessage[]> {
    const filePathParts = fileName.split('/')
    const fileNameWithoutExtension = filePathParts.pop()?.split('.').shift() || ''
    const fileExtension = getFileExtension(fileName)

    // pattern to search for file with same name
    const searchPattern = `${filePathParts[0]}/*${fileNameWithoutExtension}*.${fileExtension}`
    const foundFiles = await vscode.workspace.findFiles(searchPattern, undefined, 3)
    const testFile = foundFiles.find(file => file.fsPath.includes('test'))
    if (testFile) {
        const contextMessage = await getFilePathContext(testFile.fsPath)
        return contextMessage
    }

    const searchTestPattern = `${filePathParts[0]}/*test*.${fileExtension}`
    const foundTestFiles = await vscode.workspace.findFiles(searchTestPattern, undefined, 10)
    const testFilesContextMessages = await getContextMessageFromFiles(foundTestFiles)
    return testFilesContextMessages
}

// Get context for test file in current directory
async function getCodebaseTestFilesContext(fileName: string, isUnitTest: boolean): Promise<ContextMessage[]> {
    // exclude any files in the path with e2e or integration in the directory name
    const excludePattern = isUnitTest ? '**/*{e2e,integration}*/**' : undefined

    // search for test files
    const fileExtension = fileName ? getFileExtension(fileName) : '*'
    const testFilesPattern = `**/*test*.${fileExtension}`

    return getEditorFoundFilesContext(testFilesPattern, excludePattern)
}

// populate context messages
export async function getDirContextMessages(
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

            const templateText = 'Codebase context from file path {fileName}: '
            const contextMessage = getContextMessageWithResponse(
                populateContextTemplateFromText(templateText, truncatedContent, fileName),
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
 * Gets context messages for files found matching a global pattern.
 */
export async function getEditorFoundFilesContext(
    globalPattern: string,
    excludePattern?: string,
    numResults = 3
): Promise<ContextMessage[]> {
    const parentTestFiles = await vscode.workspace.findFiles(globalPattern, excludePattern, numResults)
    const filtered = parentTestFiles.filter(file => isValidTestFileName(file.fsPath))
    return getContextMessageFromFiles(filtered)
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
    // Search for the package.json from the base path
    const packageJsonPath = await vscode.workspace.findFiles('**/package.json', undefined, 1)
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
        const templateText = 'Here are the scripts and devDependencies from the package.json file for the codebase: '

        return getContextMessageWithResponse(
            populateContextTemplateFromText(templateText, truncatedContent, fileName),
            { fileName },
            answers.packageJson
        )
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
export async function getCurrentDirFilteredContext(
    dirUri: vscode.Uri,
    filesInDir: [string, vscode.FileType][],
    currentFileName: string
): Promise<ContextMessage[]> {
    const contextMessages: ContextMessage[] = []

    const filePathParts = currentFileName.split('/')
    const currentFileNameWithoutExtension = filePathParts.pop()?.split('.').shift() || ''

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

            const templateText = 'Codebase context from file path {fileName}: '
            const contextMessage = getContextMessageWithResponse(
                populateContextTemplateFromText(templateText, truncatedContent, fileName),
                { fileName }
            )
            contextMessages.push(...contextMessage)

            // return context directly if the file name matches the current file name
            if (file[0].includes(currentFileNameWithoutExtension)) {
                return contextMessages
            }
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

        // Get context using file path for files not in the current workspace
        if (!isInWorkspace(tab.uri)) {
            const contextMessage = await getFilePathContext(tab.uri.fsPath)
            contextMessages.push(...contextMessage)
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
        const message = getContextMessageWithResponse(populateCurrentEditorContextTemplate(truncatedText, fileName), {
            fileName,
        })

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
        return humanInput
    }

    const startLineNumber = selectionInfo?.selectionRange ? `${selectionInfo?.selectionRange?.start.line + 1}` : ''
    const fileRange = selectionInfo?.selectionRange
        ? `${selectionInfo?.selectionRange?.start.line + 1}-${selectionInfo?.selectionRange?.end.line + 1}`
        : startLineNumber

    if (!workspaceRoot) {
        return humanInput + displayFileName + fileName + fileRange
    }

    // check if fileName is a workspace file or not
    const isFileWorkspaceFile = isInWorkspace(URI.file(fileName)) !== undefined

    // Create markdown link to the file
    const fileUri = isFileWorkspaceFile ? vscode.Uri.joinPath(workspaceRoot, fileName) : URI.file(fileName)
    const fileLink = `vscode://file${fileUri.fsPath}:${startLineNumber}`

    return `${humanInput}\n\nFile: [_${fileName}:${fileRange}_](${fileLink})`
}

/**
 * Gets context messages for the current open file's content based on the editor selection if any (or use visible content)
 */
export function getCurrentFileContextFromEditorSelection(selection: ActiveTextEditorSelection): ContextMessage[] {
    if (!selection.selectedText) {
        return []
    }

    return getContextMessageWithResponse(
        populateCurrentFileFromEditorSelectionContextTemplate(selection, selection.fileName),
        selection,
        answers.file
    )
}

/**
 * Gets the current open file's content and adds it to the context.
 */
export function getCurrentFileContext(): ContextMessage[] {
    const currentFile = vscode.window.activeTextEditor?.document
    const currentFileText = currentFile?.getText()
    if (!currentFileText || !currentFile?.fileName) {
        return []
    }

    const truncatedContent = truncateText(currentFileText, MAX_CURRENT_FILE_TOKENS)
    const fileName = vscode.workspace.asRelativePath(currentFile.fileName)

    return getContextMessageWithResponse(populateCodeContextTemplate(truncatedContent, fileName), {
        fileName,
    })
}

/**
 * Create a context message to include a list of file names from the directory that contains the file
 */
export async function getDirectoryFileListContext(
    workspaceRootUri: vscode.Uri,
    fileName?: string
): Promise<ContextMessage[]> {
    try {
        if (!workspaceRootUri) {
            throw new Error('No workspace root found')
        }

        const fileUri = fileName ? vscode.Uri.joinPath(workspaceRootUri, fileName) : workspaceRootUri
        const directoryUri = !fileName ? workspaceRootUri : vscode.Uri.joinPath(fileUri, '..')
        const directoryFiles = await getFilesFromDir(directoryUri, false)
        const fileNames = directoryFiles.map(file => file[0])
        const truncatedFileNames = truncateText(fileNames.join(', '), MAX_CURRENT_FILE_TOKENS)
        const fsPath = fileName || 'root'

        return [
            {
                speaker: 'human',
                text: populateListOfFilesContextTemplate(truncatedFileNames, fsPath),
            },
            {
                speaker: 'assistant',
                text: answers.fileList.replace('{fileName}', fsPath),
            },
        ]
    } catch (error) {
        console.error(error)
        return []
    }
}

/**
 * Finds the test file corresponding to the given file name.
 *
 * @param fileName - The name of the file to find the test file for
 * @returns The path to the found test file, or an empty string if none found
 */
export async function getTestFileOfCurrentFileContext(fileName: string): Promise<ContextMessage[]> {
    const filePathParts = fileName.split('/')
    const fileNameWithoutExtension = filePathParts.pop()?.split('.').shift() || ''
    const fileExtension = getFileExtension(fileName)

    // pattern to search for file with same name
    const searchPattern = `${filePathParts[0]}/*${fileNameWithoutExtension}*.${fileExtension}`

    // find matching files
    const foundFiles = await vscode.workspace.findFiles(searchPattern, undefined, 3)

    // find test file from matches
    const testFile = foundFiles.find(file => file.fsPath.includes('test'))

    if (testFile) {
        const contextMessage = await getFilePathContext(testFile.fsPath)
        return contextMessage
    }

    return []
}

/**
 * Creates a URI for a test file that matches the path provided based on the current open file.
 *
 * e.x.
 * test_foo.py & bar.py -> test_bar.py
 * foo.test.ts & bar.ts -> bar.test.ts
 * fooTest.scala & bar.scala -> barTest.scala
 *
 * @param repoTestFilePath - The path to the test file in the repository
 * @param currentFileUri - The URI of the currently open file
 * @returns A URI for a test file that matches the repoTestFilePath using info from currentFileUri
 */
export function createTestFileUri(repoTestFilePath: string, currentFileUri: vscode.Uri): vscode.Uri {
    const currentFilePath = currentFileUri.fsPath
    // if the current file is a test file, return the current file Uri
    if (!currentFilePath || !repoTestFilePath) {
        return currentFileUri
    }

    const currentFileName = getFileNameFromPath(currentFilePath)
    const testFileName = getFileNameFromPath(repoTestFilePath).toLowerCase()

    const isFileNameStartsWithTest = testFileName.startsWith('test')
    const length = testFileName.length - 1

    let prefix = isFileNameStartsWithTest ? 'test' : currentFileName
    const suffix = !isFileNameStartsWithTest ? 'test' : currentFileName

    const indexByTestIndex = isFileNameStartsWithTest ? 4 : length - 4
    const charByTestIndex = testFileName[indexByTestIndex]

    if (!isCharAlphanumeric(charByTestIndex)) {
        prefix += charByTestIndex
    }

    // Replace the currentFileName from currentFileUri with the new test file name
    const testFsPathForCurrentFile = currentFileUri.toString().replace(currentFileName, prefix + suffix)
    return vscode.Uri.parse(testFsPathForCurrentFile)
}

/**
 * Checks if a character is alphanumeric.
 */
function isCharAlphanumeric(char: string): boolean {
    return /^[\dA-Za-z]+$/.test(char)
}
