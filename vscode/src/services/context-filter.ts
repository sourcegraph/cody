import * as vscode from 'vscode'

import { CodyIgnoreFileName, setCodyIgnoreList } from '@sourcegraph/cody-shared/src/chat/context-filter'

export async function updateCodyIgnoreList(): Promise<void> {
    // Get the current cody ignore list
    const update = async (): Promise<void> => {
        const currentIgnoreList = await getCodyIgnoreFile()
        if (!currentIgnoreList) {
            return
        }
        // Set the updated cody ignore list
        setCodyIgnoreList(currentIgnoreList)
    }

    // Update ignore list on editor change
    vscode.workspace.onDidChangeTextDocument(async e => {
        if (e.document.uri.scheme !== 'file') {
            return
        }
        if (e.document.uri.fsPath.endsWith(CodyIgnoreFileName)) {
            await update()
        }
    })

    await update()
}

async function getCodyIgnoreFile(): Promise<string | undefined> {
    // Get git ignore file context using the vs code api
    // First, get the gitignore file from the workspace root directory
    const codyIgnoreFile = await vscode.workspace.findFiles(CodyIgnoreFileName)
    // If the gitignore file exists, get the content of the file
    if (!codyIgnoreFile.length) {
        return undefined
    }
    const bytes = await vscode.workspace.fs.readFile(codyIgnoreFile[0])
    const decoded = new TextDecoder('utf-8').decode(bytes)
    return decoded
}
