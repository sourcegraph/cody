import * as vscode from 'vscode'

import {
    CODY_IGNORE_FILENAME,
    deleteCodyIgnoreList,
    setCodyIgnoreList,
} from '@sourcegraph/cody-shared/src/chat/context-filter'

import { logDebug } from '../log'

/**
 * Gets a file system watcher for the .cody/.ignore file in the workspace.
 *
 * The watcher will update the ignored file list on changes and re-create itself if the workspace changes.
 * @returns The codyignore file watcher, or null if no workspace is open.
 */
export async function getCodyignoreFileWatcher(): Promise<vscode.FileSystemWatcher | null> {
    let codyIgnoreFileUri: vscode.Uri | null = null
    let codyignoreFileWatcher: vscode.FileSystemWatcher | null = null

    const getWatcher = async (): Promise<vscode.FileSystemWatcher | null> => {
        if (!hasWorkspaceFolder()) {
            return null
        }
        const newCodyIgnoreFileUri = await getCodyIgnoreFileUri()
        // If the .cody/.ignore file exists, get the content of the file
        if (!newCodyIgnoreFileUri?.fsPath) {
            return null
        }
        if (codyIgnoreFileUri?.fsPath === newCodyIgnoreFileUri.fsPath) {
            return codyignoreFileWatcher
        }
        codyIgnoreFileUri = newCodyIgnoreFileUri
        await update(newCodyIgnoreFileUri)
        return create(newCodyIgnoreFileUri)
    }

    // Update watcher and workspace path on workspace change
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
        await getWatcher()
    })

    // Create watcher and start watching on .cody/.ignore file change
    const create = (ignoreFileUri: vscode.Uri): vscode.FileSystemWatcher => {
        // remove existing watcher if any
        if (codyignoreFileWatcher) {
            codyignoreFileWatcher.dispose()
            codyignoreFileWatcher = null
        }
        const watchPattern = getFileWatcherRelativePattern(ignoreFileUri.fsPath)
        const watcher = vscode.workspace.createFileSystemWatcher(watchPattern)
        // update the ignored list on file change
        watcher.onDidChange(async () => {
            await update(ignoreFileUri)
        })
        watcher.onDidCreate(async () => {
            await update(ignoreFileUri)
        })
        watcher.onDidDelete(() => {
            deleteCodyIgnoreList()
        })
        codyignoreFileWatcher = watcher
        return watcher
    }

    const update = async (fileUri: vscode.Uri): Promise<void> => {
        if (!hasWorkspaceFolder()) {
            return
        }
        try {
            const bytes = await vscode.workspace.fs.readFile(fileUri)
            const decoded = new TextDecoder('utf-8').decode(bytes)
            setCodyIgnoreList(fileUri.fsPath, decoded)
        } catch {
            console.error('Failed to read codyignore file')
        }
    }

    // Check if workspace is open before starting watcher
    const hasWorkspaceFolder = (): boolean => !!vscode.workspace.workspaceFolders?.length

    return getWatcher()
}

// Find the .cody/.ignore file location using the vs code api
async function getCodyIgnoreFileUri(): Promise<vscode.Uri | undefined> {
    const codyIgnoreFile = await vscode.workspace.findFiles(CODY_IGNORE_FILENAME, undefined, 1)
    if (!codyIgnoreFile.length) {
        logDebug('getCodyIgnoreFileUri', 'cannot find .cody/.ignore file')
        return undefined
    }
    return codyIgnoreFile[0]
}

// Use the file as the first arg to RelativePattern because a file watcher will be set up on the
// first arg given. If this is a directory with many files, such as the user's home directory,
// it will cause a very large number of watchers to be created, which will exhaust the system.
// This occurs even if the second arg is a relative file path with no wildcards.
function getFileWatcherRelativePattern(fsPath: string): vscode.RelativePattern {
    return new vscode.RelativePattern(fsPath, '*')
}
