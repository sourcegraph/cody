import * as vscode from 'vscode'

import { CODY_IGNORE_FILENAME, setCodyIgnoreList } from '@sourcegraph/cody-shared/src/chat/context-filter'

/**
 * Gets a file system watcher for the .codyignore file in the workspace.
 *
 * The watcher will update the ignored file list on changes and re-create itself if the workspace changes.
 *
 * @returns The codyignore file watcher, or null if no workspace is open.
 */
export async function getCodyignoreFileWatcher(): Promise<vscode.FileSystemWatcher | null> {
    let workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    let codyIgnoreFileUri: vscode.Uri | null = null
    let codyignoreFileWatcher: vscode.FileSystemWatcher | null = null

    const getWatcher = async (): Promise<vscode.FileSystemWatcher | null> => {
        const foundUri = await getCodyIgnoreFileUri()
        // If the gitignore file exists, get the content of the file
        if (!workspacePath || !foundUri?.fsPath) {
            return null
        }
        if (codyIgnoreFileUri?.fsPath === foundUri.fsPath) {
            return codyignoreFileWatcher
        }
        codyIgnoreFileUri = foundUri
        await update(foundUri)
        return create(foundUri)
    }

    // Update watcher and workspace path on workspace change
    vscode.workspace.onDidChangeWorkspaceFolders(async event => {
        workspacePath = event.added[0].uri.fsPath
        await getWatcher()
    })

    // Create watcher and start watching on codyignore file change
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
        watcher.onDidChange(async () => {
            await update(ignoreFileUri)
        })
        watcher.onDidDelete(() => {
            setCodyIgnoreList('')
        })
        codyignoreFileWatcher = watcher
        return watcher
    }

    const update = async (fileUri: vscode.Uri): Promise<void> => {
        if (!workspacePath) {
            return
        }
        try {
            const bytes = await vscode.workspace.fs.readFile(fileUri)
            const decoded = new TextDecoder('utf-8').decode(bytes)
            setCodyIgnoreList(decoded)
        } catch {
            console.error('Failed to read codyignore file')
        }
    }

    return getWatcher()
}

// Find the .cody/.ignore file location using the vs code api
async function getCodyIgnoreFileUri(): Promise<vscode.Uri | undefined> {
    const codyIgnoreFile = await vscode.workspace.findFiles(CODY_IGNORE_FILENAME)
    if (!codyIgnoreFile.length) {
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
