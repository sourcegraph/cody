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

/**
 * Decodes the text contents of a VS Code file URI.
 * @param fileUri - The VS Code URI of the file to decode.
 * @returns A Promise resolving to the decoded text contents of the file.
 */
export async function getDocText(fileUri: URI): Promise<string> {
    return vscode.workspace.fs.readFile(fileUri).then(
        bytes => new TextDecoder('utf-8').decode(bytes),
        error => ''
    )
}
