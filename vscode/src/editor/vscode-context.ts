import { basename, extname } from 'path'

import { findLast } from 'lodash'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

import { answers, displayFileName } from '@sourcegraph/cody-shared/src/chat/commands/templates'
import { createSelectionDisplayText, isValidTestFileName } from '@sourcegraph/cody-shared/src/chat/commands/utils'
import { ContextMessage, getContextMessageWithResponse } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { dirname } from '@sourcegraph/cody-shared/src/common'
import { ActiveTextEditorSelection } from '@sourcegraph/cody-shared/src/editor'
import { EditorContextMessages } from '@sourcegraph/cody-shared/src/editor-context'
import { MAX_CURRENT_FILE_TOKENS } from '@sourcegraph/cody-shared/src/prompt/constants'
import {
    populateCodeContextTemplate,
    populateContextTemplateFromText,
    populateCurrentEditorContextTemplate,
    populateCurrentFileFromEditorSelectionContextTemplate,
    populateImportListContextTemplate,
    populateListOfFilesContextTemplate,
    populateTerminalOutputContextTemplate,
} from '@sourcegraph/cody-shared/src/prompt/templates'
import { truncateText } from '@sourcegraph/cody-shared/src/prompt/truncation'

// TODO bee clean up
export class VSCodeEditorContext implements EditorContextMessages {
    /**
     * Get context messages for the currently open editor tabs.
     *
     * @param skipDirectory - Optional directory path to skip. Tabs with URIs in this directory will be skipped.
     * @returns Promise<ContextMessage[]> - Promise resolving to the array of context messages for the open tabs.
     */
    public async getEditorOpenTabsContext(skipDirectory?: string): Promise<ContextMessage[]> {
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
                const contextMessage = await this.getFilePathContext(tab.uri.fsPath)
                contextMessages.push(...contextMessage)
                continue
            }

            // Get file name and extract context from current workspace file
            const fileUri = tab.uri
            const fileName = createVSCodeRelativePath(fileUri.fsPath)
            const fileText = await getCurrentVSCodeDocTextByURI(fileUri)

            // Truncate file text
            const truncatedText = truncateText(fileText, MAX_CURRENT_FILE_TOKENS)

            // Create context message
            const message = getContextMessageWithResponse(
                populateCurrentEditorContextTemplate(truncatedText, fileName),
                {
                    fileName,
                }
            )

            contextMessages.push(...message)
        }

        return contextMessages
    }

    /**
     * Gets the context messages for the current directory.
     *
     * @param isUnitTestRequest - Whether this is a request from a unit test.
     * @returns A promise resolving to the context messages for the current directory.
     */
    public async getCurrentDirContext(isUnitTestRequest: boolean): Promise<ContextMessage[]> {
        // Get current open file path
        const currentFile = getCurrentVSCodeDoc()?.fileName
        if (!currentFile) {
            return []
        }

        const currentDir = dirname(currentFile)
        return this.getEditorDirContext(currentDir, currentFile, isUnitTestRequest)
    }

    /**
     * Gets context messages for the given directory path.
     * Optionally filters results to only files matching the given selection file name.
     */
    public async getEditorDirContext(
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

    /**
     * Gets context messages for the given file path.
     *
     * @param filePath - The file path to get context for.
     * @returns A promise resolving to the context messages for the given file path.
     */
    public async getFilePathContext(filePath: string): Promise<ContextMessage[]> {
        const fileName = createVSCodeRelativePath(filePath)
        try {
            const decoded = await getFilePathContext(filePath)
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
     * Gets context messages for the current open file in the editor
     * using the provided selection.
     *
     * @param selection - The editor selection to use.
     * @returns Context messages for the current open file.
     */
    public getCurrentFileContextFromEditorSelection(selection: ActiveTextEditorSelection): ContextMessage[] {
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
     * Gets context messages for terminal output.
     *
     * @param terminalOutput - The output from the terminal to add to the context.
     *
     * @returns ContextMessage[] - The context messages containing the truncated
     * terminal output.
     */
    public getTerminalOutputContext(terminalOutput: string): ContextMessage[] {
        const truncatedTerminalOutput = truncateText(terminalOutput, MAX_CURRENT_FILE_TOKENS)

        return [
            { speaker: 'human', text: populateTerminalOutputContextTemplate(truncatedTerminalOutput) },
            {
                speaker: 'assistant',
                text: answers.terminal,
            },
        ]
    }

    public async getDirectoryFileListContext(
        workspaceRootUri: URI,
        isTestRequest: boolean,
        fileName?: string
    ): Promise<ContextMessage[]> {
        try {
            if (!workspaceRootUri) {
                throw new Error('No workspace root found')
            }

            const fileUri = fileName ? vscode.Uri.joinPath(workspaceRootUri, fileName) : workspaceRootUri
            const directoryUri = fileName ? vscode.Uri.joinPath(fileUri, '..') : workspaceRootUri
            const directoryFiles = await getFilesFromDir(directoryUri, isTestRequest)
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

    public async getPackageJsonContext(filePath: string): Promise<ContextMessage[]> {
        const currentFilePath = filePath || getCurrentVSCodeDoc()?.uri.fsPath
        if (!currentFilePath) {
            return []
        }
        // Search for the package.json from the base path
        const packageJsonPath = await findVSCodeFiles('**/package.json', undefined, 1)
        if (!packageJsonPath.length) {
            return []
        }
        try {
            const packageJsonUri = packageJsonPath[0]
            const decoded = await decodeVSCodeTextDoc(packageJsonUri)
            // Turn the content into a json and get the scripts object only
            const packageJson = JSON.parse(decoded) as Record<string, unknown>
            const scripts = packageJson.scripts
            const devDependencies = packageJson.devDependencies
            // stringify the scripts object with devDependencies
            const context = JSON.stringify({ scripts, devDependencies })
            const truncatedContent = truncateText(context.toString() || decoded.toString(), MAX_CURRENT_FILE_TOKENS)
            const fileName = createVSCodeRelativePath(packageJsonUri.fsPath)
            const templateText =
                'Here are the scripts and devDependencies from the package.json file for the codebase: '

            return getContextMessageWithResponse(
                populateContextTemplateFromText(templateText, truncatedContent, fileName),
                { fileName },
                answers.packageJson
            )
        } catch {
            return []
        }
    }

    public async getCurrentFileImportsContext(): Promise<ContextMessage[]> {
        const currentFile = getCurrentVSCodeDoc()
        if (!currentFile?.uri || !currentFile.languageId) {
            return []
        }
        try {
            const lastImportRange = await getFoldingRanges(currentFile.uri, 'imports', true)
            const lastImportLineRange = lastImportRange?.[0]
            if (!lastImportLineRange) {
                return []
            }

            // Get the line number of the last import statement
            const lastImportLine = lastImportLineRange.end
            const importsRange = new vscode.Range(0, 0, lastImportLine, 0)
            const importStatements = currentFile.getText(importsRange)
            if (!importStatements) {
                return []
            }

            const truncatedContent = truncateText(importStatements, MAX_CURRENT_FILE_TOKENS / 2)
            const fileName = createVSCodeRelativePath(currentFile?.fileName)

            return getContextMessageWithResponse(populateImportListContextTemplate(truncatedContent, fileName), {
                fileName,
            })
        } catch {
            return []
        }
    }

    /**
     * Gets the display text to show for the human's input.
     *
     * If there is a selection, display the file name + range alongside with human input
     * If the workspace root is available, it generates a markdown link to the file.
     */
    public getHumanDisplayTextWithEditorFile(
        humanInput: string,
        selectionInfo: ActiveTextEditorSelection | null,
        workspaceRoot: URI | null
    ): string {
        const fileName = selectionInfo?.fileName
        if (!fileName) {
            return humanInput
        }

        if (!workspaceRoot) {
            return humanInput + displayFileName + fileName
        }

        // check if fileName is a workspace file or not
        const isFileWorkspaceFile = isInWorkspace(URI.file(fileName)) !== undefined
        const fileUri = isFileWorkspaceFile ? vscode.Uri.joinPath(workspaceRoot, fileName) : URI.file(fileName)

        // Create markdown link to the file
        return createHumanDisplayTextWithDocLink(humanInput, fileUri, selectionInfo)
    }
}

/**
 * Checks if a file URI is part of the current workspace.
 *
 * @param fileToCheck - The file URI to check
 * @returns True if the file URI belongs to a workspace folder, false otherwise
 */
export function isInWorkspace(fileToCheck: URI): boolean {
    return vscode.workspace.getWorkspaceFolder(fileToCheck) !== undefined
}

function createFileContextResponseMessage(context: string, filePath: string): ContextMessage[] {
    const fileName = createVSCodeRelativePath(filePath)
    const truncatedContent = truncateText(context, MAX_CURRENT_FILE_TOKENS)
    return getContextMessageWithResponse(populateCodeContextTemplate(truncatedContent, fileName), {
        fileName,
    })
}

export async function getFilePathContext(filePath: string): Promise<string> {
    const fileUri = vscode.Uri.file(filePath)
    try {
        const decoded = await decodeVSCodeTextDoc(fileUri)
        return decoded
    } catch (error) {
        console.error(error)
    }
    return ''
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

            if (!testFilesOnly) {
                return !isDirectory && !isHiddenFile
            }

            const isFileNameIncludesTest = isValidTestFileName(fileName)
            return !isDirectory && !isHiddenFile && isFileNameIncludesTest
        })
    } catch (error) {
        console.error(error)
        return []
    }
}

/**
 * Finds VS Code workspace files matching a global pattern.
 *
 * @param globalPattern - The global file search pattern to match.
 * @param excludePattern - An optional exclude pattern to filter results.
 * @param maxResults - The maximum number of results to return.
 *
 * @returns A Promise resolving to an array of URI objects for the matching files, up to maxResults.
 */
export async function findVSCodeFiles(globalPattern: string, excludePattern?: string, maxResults = 3): Promise<URI[]> {
    try {
        // const defaultExcludePatterns = ['.*','node_modules','snap*']
        const excluded = excludePattern || '**/{.*,node_modules,snap*}/**'

        // set cancellation token to time out after 20s
        const token = new vscode.CancellationTokenSource()

        // Set timeout to 20 seconds
        setTimeout(() => {
            token.cancel()
        }, 20000)

        const files = await vscode.workspace.findFiles(globalPattern, excluded, maxResults, token.token)
        return files || []
    } catch {
        return []
    }
}

/**
 * Decodes the text contents of a VS Code file URI.
 *
 * @param fileUri - The VS Code URI of the file to decode.
 *
 * @returns A Promise resolving to the decoded text contents of the file.
 */
export async function decodeVSCodeTextDoc(fileUri: URI): Promise<string> {
    try {
        const bytes = await vscode.workspace.fs.readFile(fileUri)
        const decoded = new TextDecoder('utf-8').decode(bytes)
        return decoded
    } catch {
        return ''
    }
}

/**
 * Creates a relative file path using the VS Code workspace APIs.
 *
 * @param filePath - The absolute file path to convert to a relative path.
 * @returns The relative path string for the given file path.
 */
export function createVSCodeRelativePath(filePath: string | URI): string {
    return vscode.workspace.asRelativePath(filePath)
}

/**
 * Gets the currently active VS Code text document instance if one exists.
 *
 * @returns The active VS Code text document, or undefined if none.
 */
export function getCurrentVSCodeDoc(): vscode.TextDocument | undefined {
    const doc = vscode.window.activeTextEditor?.document
    if (!doc) {
        return undefined
    }
    return doc
}

/**
 * Gets the full text content of the currently active VS Code text document.
 *
 * @param range - Optional VS Code range to get only a subset of the document text.
 * @returns The text content of the active document, or empty string if none.
 */
export function getCurrentVSCodeDocText(range?: vscode.Range): string {
    const doc = vscode.window.activeTextEditor?.document
    if (!doc) {
        return ''
    }
    return doc?.getText(range) || ''
}

/**
 * Gets the text content of a VS Code text document specified by URI.
 *
 * @param uri - The URI of the text document to get content for.
 * @param range - Optional VS Code range to get only a subset of the document text.
 * @returns A Promise resolving to the text content of the specified document.
 */
export async function getCurrentVSCodeDocTextByURI(uri: URI, range?: vscode.Range): Promise<string> {
    try {
        const doc = await vscode.workspace.openTextDocument(uri)
        if (!doc) {
            return ''
        }
        return doc?.getText(range) || ''
    } catch {
        return ''
    }
}

/**
 * Gets folding ranges for the given URI.
 *
 * @param uri - The URI of the document to get folding ranges for.
 * @param type - Optional type of folding ranges to get. Can be 'imports', 'comment' or 'all'. Default 'all'.
 * @param getLastItem - Optional boolean whether to only return the last range of the given type. Default false.
 * @returns A promise resolving to the array of folding ranges, or undefined if none.
 *
 * This calls the built-in VS Code folding range provider to get folding ranges for the given URI.
 * It can filter the results to only return ranges of a certain type, like imports or comments.
 * The getLastItem flag returns just the last range of the given type.
 */
export async function getFoldingRanges(
    uri: URI,
    type?: 'imports' | 'comment' | 'all',
    getLastItem?: boolean
): Promise<vscode.FoldingRange[] | undefined> {
    // Run built-in command to get folding ranges
    const foldingRanges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
        'vscode.executeFoldingRangeProvider',
        uri
    )

    if (type === 'all') {
        return foldingRanges
    }

    const kind = type === 'imports' ? vscode.FoldingRangeKind.Imports : vscode.FoldingRangeKind.Comment

    if (!getLastItem) {
        const ranges = foldingRanges?.filter(range => range.kind === kind)
        return ranges
    }

    // Get the line number of the last import statement
    const lastKind = foldingRanges ? findLast(foldingRanges, range => range.kind === kind) : undefined

    return lastKind ? [lastKind] : []
}

/**
 * Creates a human readable display text with a link to the VS Code editor.
 *
 * @param input - The original human input text.
 * @param docUri - The URI of the referenced text document.
 * @param selection - The selection in the text document.
 * @returns The display text with a VS Code file link and selection range.
 */
export function createHumanDisplayTextWithDocLink(
    input: string,
    docUri: URI,
    selection: ActiveTextEditorSelection
): string {
    const { range, start } = createSelectionDisplayText(selection)
    const fsPath = docUri.fsPath
    const fileName = createVSCodeRelativePath(fsPath)
    const fileLink = `vscode://file${fsPath}:${start}`

    return `${input}\n\nFile: [_${fileName}:${range}_](${fileLink})`
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
    currentFileName: string,
    maxFiles = 5
): Promise<ContextMessage[]> {
    const contextMessages: ContextMessage[] = []

    const filePathParts = currentFileName.split('/')
    const fileNameWithoutExt = filePathParts.pop()?.split('.').shift() || ''

    for (const file of filesInDir) {
        // Get the context from each file
        const fileUri = vscode.Uri.joinPath(dirUri, file[0])
        const fileName = createVSCodeRelativePath(fileUri.fsPath)

        // check file size before opening the file
        // skip file if it's larger than 1MB
        const fileSize = await vscode.workspace.fs.stat(fileUri)
        if (fileSize.size > 1000000 || !fileSize.size) {
            continue
        }

        // skip current file to avoid duplicate from current file context
        if (file[0] === currentFileName) {
            continue
        }

        try {
            const decoded = await decodeVSCodeTextDoc(fileUri)
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

        // return context directly if the file name matches the current file name
        if (file[0].startsWith(fileNameWithoutExt) || file[0].endsWith(fileNameWithoutExt)) {
            return contextMessages
        }

        // each file contains 2 message-pair, e.g. 5 files = 10 messages
        if (contextMessages.length >= maxFiles * 2) {
            return contextMessages
        }
    }
    return contextMessages
}

/**
 * Gets context messages for test files related to the given file name.
 *
 * @param fileName - The name of the file to get test context for
 * @param isUnitTestRequest - Whether the request is specifically for unit tests
 *
 * @returns Promise<ContextMessage[]> - A promise resolving to context messages
 * containing information about test files related to the given file name.
 *
 * It first tries to get the current open test file (if any) in the editor
 * that matches the given file name.
 *
 * Then it searches the codebase for additional test files matching the given
 * file name, preferring unit tests if isUnitTestRequest is true.
 */
export async function getEditorTestContext(fileName: string, isUnitTestRequest = false): Promise<ContextMessage[]> {
    try {
        const currentTestFile = await getCurrentTestFileContext(fileName, isUnitTestRequest)
        if (currentTestFile.length) {
            return currentTestFile
        }
        const codebaseTestFiles = await getCodebaseTestFilesContext(fileName, isUnitTestRequest)
        return [...codebaseTestFiles, ...currentTestFile]
    } catch {
        return []
    }
}

/**
 * Gets context messages for the files in the given directory.
 *
 * @param dirUri - The URI of the directory to get files from.
 * @param filesInDir - The array of file paths in the directory.
 *
 * @returns A Promise resolving to the ContextMessage[] containing the context.
 *
 * Loops through the files in the directory, gets the content of each file,
 * truncates it, and adds it to the context messages along with the file name.
 * Limits file sizes to 1MB.
 */
export async function getDirContextMessages(
    dirUri: vscode.Uri,
    filesInDir: [string, vscode.FileType][]
): Promise<ContextMessage[]> {
    const contextMessages: ContextMessage[] = []

    for (const file of filesInDir) {
        // Get the context from each file
        const fileUri = vscode.Uri.joinPath(dirUri, file[0])
        const fileName = createVSCodeRelativePath(fileUri.fsPath)

        // check file size before opening the file. skip file if it's larger than 1MB
        const fileSize = await vscode.workspace.fs.stat(fileUri)
        if (fileSize.size > 1000000 || !fileSize.size) {
            continue
        }

        try {
            const decoded = await decodeVSCodeTextDoc(fileUri)
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
 * Gets the context for the test file related to the given file name.
 *
 * @param fileName - The name of the file to find the related test file for.
 *
 * @returns A Promise resolving to the ContextMessage[] containing the context
 * for the found test file. If no related test file is found, returns context for
 * other test files in the project.
 *
 * First searches for a file matching the fileName pattern that is a valid test file name.
 * If none found, searches for test files matching the fileName.
 * Gets the content of the found test files and returns ContextMessages.
 */
export async function getCurrentTestFileContext(fileName: string, isUnitTest: boolean): Promise<ContextMessage[]> {
    // exclude any files in the path with e2e or integration in the directory name
    const excludePattern = isUnitTest ? '**/*{e2e,integration,node_modules}*/**' : undefined

    // pattern to search for test files with same name
    const searchPattern = createVSCodeTestSearchPattern(fileName)
    const foundFiles = await findVSCodeFiles(searchPattern, excludePattern, 5)
    const testFile = foundFiles.find(file => isValidTestFileName(file.fsPath))
    if (testFile) {
        const context = await getFilePathContext(testFile.fsPath)
        return createFileContextResponseMessage(context, testFile.fsPath)
    }
    return []
}

/**
 * Gets context messages for test files related to the given file name.
 *
 * @param fileName - The name of the file to find related test files for.
 * @param isUnitTest - Whether to only look for unit test files.
 *
 * @returns Promise resolving to ContextMessage[] containing the found test files.
 *
 * Searches for test files matching the fileName, excluding e2e and integration
 * test directories if getting unit tests. Returns context messages for up to 5
 * matching test files.
 */
async function getCodebaseTestFilesContext(fileName: string, isUnitTest: boolean): Promise<ContextMessage[]> {
    // exclude any files in the path with e2e or integration in the directory name
    const excludePattern = isUnitTest ? '**/*{e2e,integration,node_modules}*/**' : undefined

    const testFilesPattern = createVSCodeTestSearchPattern(fileName, true)
    const testFilesMatches = await findVSCodeFiles(testFilesPattern, excludePattern, 5)
    const filteredTestFiles = testFilesMatches.filter(file => isValidTestFileName(file.fsPath))

    return getContextMessageFromFiles(filteredTestFiles)
}

/**
 * Creates a VS Code search pattern to find files matching the given file path.
 *
 * @param fsPath - The file system path of the file to generate a search pattern for.
 * @param fromRoot - Whether to search from the root directory. Default false.
 * @returns A search pattern string to find matching files.
 *
 * This generates a search pattern by taking the base file name without extension
 * and appending wildcards.
 *
 * If fromRoot is true, the pattern will search recursively from the repo root.
 * Otherwise, it will search only the current directory.
 */
export function createVSCodeSearchPattern(fsPath: string, fromRoot = false): string {
    const fileName = basename(fsPath)
    const fileExtension = extname(fsPath)
    const fileNameWithoutExt = fileName.replace(fileExtension, '')

    const root = fromRoot ? '**' : ''

    const currentFilePattern = `/*${fileNameWithoutExt}*${fileExtension}`
    return root + currentFilePattern
}

export function createVSCodeTestSearchPattern(fsPath: string, allTestFiles?: boolean): string {
    const fileExtension = extname(fsPath)
    const fileName = basename(fsPath, fileExtension)

    const root = '**'
    const defaultTestFilePattern = `/*test*${fileExtension}`
    const currentTestFilePattern = `/*{test_${fileName},${fileName}_test,test.${fileName},${fileName}.test,${fileName}Test}${fileExtension}`

    if (allTestFiles) {
        return `${root}${defaultTestFilePattern}`
    }

    // pattern to search for test files with the same name as current file
    return `${root}${currentTestFilePattern}`
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
        const context = await getFilePathContext(file.fsPath)
        contextMessages.push(...createFileContextResponseMessage(context, file.fsPath))
    }
    return contextMessages
}
