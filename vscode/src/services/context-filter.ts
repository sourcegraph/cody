import * as vscode from 'vscode'

import { ignores } from '@sourcegraph/cody-shared/src/chat/context-filter'
import { CODY_IGNORE_FILENAME_POSIX_GLOB } from '@sourcegraph/cody-shared/src/chat/ignore-helper'

import { logDebug } from '../log'
import { getAllCodebasesInWorkspace, getCodebaseFromWorkspaceUri } from '../repository/repositoryHelpers'

const utf8 = new TextDecoder('utf-8')

/**
 * Parses `.code/.ignore` files from the workspace and sets up a watcher to refresh
 * whenever the files change.
 * @returns A Disposable that should be disposed when the extension unloads.
 */
export function setUpCodyIgnore(): vscode.Disposable {
    onConfigChange()

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

    const onDidChangeConfig = vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('cody')) {
            onConfigChange()
        }
    })

    getAllCodebasesInWorkspace().map(result => updateCodyIgnoreCodespaceMap(result.codebase, result.ws))

    return {
        dispose() {
            watcher.dispose()
            didChangeSubscription.dispose()
            onDidChangeConfig.dispose()
        },
    }
}

export function updateCodyIgnoreCodespaceMap(codebaseName: string, workspaceFsPath: string): void {
    ignores.updateCodebaseWorkspaceMap(codebaseName, workspaceFsPath)
    logDebug('CodyIgnore:updateCodyIgnoreCodespaceMap:codebase', codebaseName)
}

function onConfigChange(): void {
    const config = vscode.workspace.getConfiguration('cody')
    ignores.setActiveState(config.get('internal.unstable') as boolean)
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

    // Get the codebase name from the git clone URL on each refresh
    // NOTE: This is needed because the ignore rules are mapped to workspace addreses at creation time, we will need to map the name of the codebase to each workspace for us to map the embedding results returned for a specific codebase by the search API to the correct workspace later.
    const codebaseName = getCodebaseFromWorkspaceUri(wf.uri)

    const ignoreFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(wf.uri, CODY_IGNORE_FILENAME_POSIX_GLOB)
    )
    const filesWithContent = await Promise.all(
        ignoreFiles.map(async fileUri => ({
            filePath: fileUri.fsPath,
            content: await tryReadFile(fileUri),
        }))
    )

    ignores.setIgnoreFiles(wf.uri.fsPath, filesWithContent, codebaseName)

    logDebug('CodyIgnore:refresh:workspace', wf.uri.fsPath)
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
    logDebug('CodyIgnore:clearIgnoreFiles:workspace', wf.uri.fsPath)
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
