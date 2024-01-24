import * as vscode from 'vscode'

import { type URI, Utils } from 'vscode-uri'
import { isValidTestFile } from '../prompt/utils'

/**
 * Checks if a file URI is part of the current workspace.
 * @param fileToCheck - The file URI to check
 * @returns True if the file URI belongs to a workspace folder, false otherwise
 */
export function isInWorkspace(fileToCheck: URI): boolean {
    return vscode.workspace.getWorkspaceFolder(fileToCheck) !== undefined
}

/**
 * Checks if a file URI exists in current workspace.
 */
export async function doesFileExist(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri)
        return true
    } catch {
        return false
    }
}

export async function getFilePathContext(fileUri: vscode.Uri): Promise<string> {
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

            const isTestFile = isValidTestFile(Utils.joinPath(dirUri, fileName))
            return !isDirectory && !isHiddenFile && isTestFile
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
export async function findVSCodeFiles(
    globalPattern: string,
    excludePattern?: string,
    maxResults = 3
): Promise<URI[]> {
    try {
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
