import * as vscode from 'vscode'

import { ignores } from '@sourcegraph/cody-shared/src/chat/context-filter'
import { CODY_IGNORE_FILENAME_POSIX_GLOB } from '@sourcegraph/cody-shared/src/chat/ignore-helper'

const utf8 = new TextDecoder('utf-8')

/**
 * Parses `.code/.ignore` files from the workspace and sets up a watcher to refresh
 * whenever the files change.
 * @returns A Disposable that should be disposed when the extension unloads.
 */
export function setUpCodyIgnore(): vscode.Disposable {
    // Refresh ignore rules when any ignore file in the workspace changes.
    const watcher = vscode.workspace.createFileSystemWatcher(CODY_IGNORE_FILENAME_POSIX_GLOB)
    watcher.onDidChange(refresh)
    watcher.onDidCreate(refresh)
    watcher.onDidDelete(refresh)

    // Handle any added/removed workspace folders.
    const didChangeSubscription = vscode.workspace.onDidChangeWorkspaceFolders(e => {
        e.added.map(wf => refresh(wf.uri))
        e.removed.map(wf => clear(wf))
    })

    // Handle existing workspace folders.
    vscode.workspace.workspaceFolders?.map(wf => refresh(wf.uri))

    return {
        dispose() {
            watcher.dispose()
            didChangeSubscription.dispose()
        },
    }
}

/**
 * Rebuilds the ignore files for the workspace containing `uri`.
 */
async function refresh(uri: vscode.Uri): Promise<void> {
    const wf = vscode.workspace.getWorkspaceFolder(uri)
    if (!wf) {
        // If this happens, we either have no workspace folder or it was removed before we started
        // processing the watch event.
        return
    }

    // We currently only support file://. To support others, we need to change all file
    // paths in lots of places to be URIs.
    if (wf.uri.scheme !== 'file') {
        return
    }

    const ignoreFiles = await vscode.workspace.findFiles(new vscode.RelativePattern(wf.uri, CODY_IGNORE_FILENAME_POSIX_GLOB))
    const filesWithContent = await Promise.all(
        ignoreFiles.map(async fileUri => ({
            filePath: fileUri.fsPath,
            content: await tryReadFile(fileUri),
        }))
    )

    ignores.setIgnoreFiles(wf.uri.fsPath, filesWithContent)
}

/**
 * Removes ignore rules for the provided WorkspaceFolder.
 */
function clear(wf: vscode.WorkspaceFolder): void {
    // We currently only support file://. To support others, we need to change all file
    // paths in lots of places to be URIs.
    if (wf.uri.scheme !== 'file') {
        return
    }

    ignores.clearIgnoreFiles(wf.uri.fsPath)
}

/**
 * Read the content of `fileUri`.
 *
 * Returns an empty string if the file was not readable (for example it was removed before we read it).
 */
async function tryReadFile(fileUri: vscode.Uri): Promise<string> {
    return vscode.workspace.fs.readFile(fileUri).then(
        content => utf8.decode(content),
        error => {
            console.error(`Skipping unreadable ignore file ${fileUri}: ${error}`)
            return ''
        }
    )
}
