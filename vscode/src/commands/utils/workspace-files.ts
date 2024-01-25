import * as vscode from 'vscode'

import type { URI } from 'vscode-uri'

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
