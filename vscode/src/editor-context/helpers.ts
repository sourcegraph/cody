import { basename, extname } from 'path'

import { findLast } from 'lodash'
import * as vscode from 'vscode'
import { type URI } from 'vscode-uri'

import {
    getContextMessageWithResponse,
    type ContextMessage,
} from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { MAX_CURRENT_FILE_TOKENS } from '@sourcegraph/cody-shared/src/prompt/constants'
import {
    populateCodeContextTemplate,
    populateContextTemplateFromText,
} from '@sourcegraph/cody-shared/src/prompt/templates'
import { truncateText } from '@sourcegraph/cody-shared/src/prompt/truncation'

import { isValidTestFileName } from '../commands/prompt/utils'

/**
 * Checks if a file URI is part of the current workspace.
 * @param fileToCheck - The file URI to check
 * @returns True if the file URI belongs to a workspace folder, false otherwise
 */
export function isInWorkspace(fileToCheck: URI): boolean {
    return vscode.workspace.getWorkspaceFolder(fileToCheck) !== undefined
}

function createFileContextResponseMessage(context: string, fileUri: vscode.Uri): ContextMessage[] {
    const truncatedContent = truncateText(context, MAX_CURRENT_FILE_TOKENS)
    return getContextMessageWithResponse(populateCodeContextTemplate(truncatedContent, fileUri), {
        type: 'file',
        uri: fileUri,
        content: truncatedContent,
        source: 'editor',
    })
}

async function getFilePathContext(fileUri: vscode.Uri): Promise<string> {
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
 * @param globalPattern - The global file search pattern to match.
 * @param excludePattern - An optional exclude pattern to filter results.
 * @param maxResults - The maximum number of results to return.
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
 * @param fileUri - The VS Code URI of the file to decode.
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
 * Gets the text content of a VS Code text document specified by URI.
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
 * Generates context messages for each file in a given directory.
 * @param dirUri - The URI representing the directory to be analyzed.
 * @param filesInDir - An array of tuples containing the name and type of each file in the directory.
 * @returns An array of context messages, one for each file in the directory.
 */
export async function getCurrentDirFilteredContext(
    dirUri: vscode.Uri,
    filesInDir: [string, vscode.FileType][],
    currentFile: vscode.Uri,
    maxFiles = 5
): Promise<ContextMessage[]> {
    const contextMessages: ContextMessage[] = []

    const filePathParts = currentFile.path.split('/')
    const fileNameWithoutExt = filePathParts.pop()?.split('.').shift() || ''

    for (const file of filesInDir) {
        // Get the context from each file
        const fileUri = vscode.Uri.joinPath(dirUri, file[0])

        // check file size before opening the file
        // skip file if it's larger than 1MB
        const fileSize = await vscode.workspace.fs.stat(fileUri)
        if (fileSize.size > 1000000 || !fileSize.size) {
            continue
        }

        // skip current file to avoid duplicate from current file context
        if (file[0] === currentFile.path) {
            continue
        }

        try {
            const decoded = await decodeVSCodeTextDoc(fileUri)
            const truncatedContent = truncateText(decoded, MAX_CURRENT_FILE_TOKENS)
            // From line 0 to the end of truncatedContent
            const range = new vscode.Range(0, 0, truncatedContent.split('\n').length, 0)

            const templateText = 'Codebase context from file path {fileName}: '
            const contextMessage = getContextMessageWithResponse(
                populateContextTemplateFromText(templateText, truncatedContent, fileUri),
                { type: 'file', uri: fileUri, content: truncatedContent, source: 'editor', range }
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
 * @param file - The file to get test context for
 * @param isUnitTestRequest - Whether the request is specifically for unit tests
 * @returns Promise<ContextMessage[]> - A promise resolving to context messages
 * containing information about test files related to the given file name.
 *
 * It first tries to get the current open test file (if any) in the editor
 * that matches the given file name.
 *
 * Then it searches the codebase for additional test files matching the given
 * file name, preferring unit tests if isUnitTestRequest is true.
 */
export async function getEditorTestContext(file: vscode.Uri, isUnitTestRequest = false): Promise<ContextMessage[]> {
    try {
        const currentTestFile = await getCurrentTestFileContext(file, isUnitTestRequest)
        if (currentTestFile.length) {
            return currentTestFile
        }
        const codebaseTestFiles = await getCodebaseTestFilesContext(file, isUnitTestRequest)
        return [...codebaseTestFiles, ...currentTestFile]
    } catch {
        return []
    }
}

/**
 * Gets context messages for the files in the given directory.
 * @param dirUri - The URI of the directory to get files from.
 * @param filesInDir - The array of file paths in the directory.
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

        // check file size before opening the file. skip file if it's larger than 1MB
        const fileSize = await vscode.workspace.fs.stat(fileUri)
        if (fileSize.size > 1000000 || !fileSize.size) {
            continue
        }

        try {
            const decoded = await decodeVSCodeTextDoc(fileUri)
            const truncatedContent = truncateText(decoded, MAX_CURRENT_FILE_TOKENS)
            const range = new vscode.Range(0, 0, truncatedContent.split('\n').length, 0)

            const templateText = 'Codebase context from file path {fileName}: '
            const contextMessage = getContextMessageWithResponse(
                populateContextTemplateFromText(templateText, truncatedContent, fileUri),
                { type: 'file', uri: fileUri, content: truncatedContent, source: 'editor', range }
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
 * @param file - The file to find the related test file for.
 * @returns A Promise resolving to the ContextMessage[] containing the context
 * for the found test file. If no related test file is found, returns context for
 * other test files in the project.
 *
 * First searches for a file matching the fileName pattern that is a valid test file name.
 * If none found, searches for test files matching the fileName.
 * Gets the content of the found test files and returns ContextMessages.
 */
async function getCurrentTestFileContext(file: vscode.Uri, isUnitTest: boolean): Promise<ContextMessage[]> {
    // exclude any files in the path with e2e or integration in the directory name
    const excludePattern = isUnitTest ? '**/*{e2e,integration,node_modules}*/**' : undefined

    // pattern to search for test files with same name
    const searchPattern = createVSCodeTestSearchPattern(file.fsPath)
    const foundFiles = await findVSCodeFiles(searchPattern, excludePattern, 5)
    const testFile = foundFiles.find(file => isValidTestFileName(file.fsPath))
    if (testFile) {
        const context = await getFilePathContext(testFile)
        return createFileContextResponseMessage(context, testFile)
    }
    return []
}

/**
 * Gets context messages for test files related to the given file name.
 * @param file - The file to find related test files for.
 * @param isUnitTest - Whether to only look for unit test files.
 * @returns Promise resolving to ContextMessage[] containing the found test files.
 *
 * Searches for test files matching the fileName, excluding e2e and integration
 * test directories if getting unit tests. Returns context messages for up to 5
 * matching test files.
 */
async function getCodebaseTestFilesContext(file: vscode.Uri, isUnitTest: boolean): Promise<ContextMessage[]> {
    // exclude any files in the path with e2e or integration in the directory name
    const excludePattern = isUnitTest ? '**/*{e2e,integration,node_modules}*/**' : undefined

    const testFilesPattern = createVSCodeTestSearchPattern(file.fsPath, true)
    const testFilesMatches = await findVSCodeFiles(testFilesPattern, excludePattern, 5)
    const filteredTestFiles = testFilesMatches.filter(file => isValidTestFileName(file.fsPath))

    return getContextMessageFromFiles(filteredTestFiles)
}

function createVSCodeTestSearchPattern(fsPath: string, allTestFiles?: boolean): string {
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
 * @param files - The array of file URIs to get context messages for.
 * @returns A Promise resolving to an array of ContextMessage objects containing context from the files.
 */
async function getContextMessageFromFiles(files: vscode.Uri[]): Promise<ContextMessage[]> {
    const contextMessages: ContextMessage[] = []
    for (const file of files) {
        const context = await getFilePathContext(file)
        contextMessages.push(...createFileContextResponseMessage(context, file))
    }
    return contextMessages
}
