import { dirname } from 'path'

import * as vscode from 'vscode'

import { ignores } from '@sourcegraph/cody-shared/src/chat/context-filter'
import { CODY_IGNORE_FILENAME_POSIX_GLOB } from '@sourcegraph/cody-shared/src/chat/ignore-helper'

import { logDebug } from '../log'
import { getCodebaseFromWorkspaceUri } from '../repository/repositoryHelpers'

const utf8 = new TextDecoder('utf-8')

/**
 * Parses `.code/ignore` files from the workspace and sets up a watcher to refresh
 * whenever the files change.
 *
 * This is called once the git extension has started up
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

    // NOTE This can be removed once cody ignore is stable.
    const onDidChangeConfig = vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('cody')) {
            onConfigChange()
        }
    })

    return {
        dispose() {
            watcher.dispose()
            didChangeSubscription.dispose()
            onDidChangeConfig.dispose()
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

    // Get the codebase name from the git clone URL on each refresh
    // NOTE: This is needed because the ignore rules are mapped to workspace addreses at creation time, we will need to map the name of the codebase to each workspace for us to map the embedding results returned for a specific codebase by the search API to the correct workspace later.
    const codebaseName = getCodebaseFromWorkspaceUri(wf.uri)
    const ignoreFilePattern = new vscode.RelativePattern(wf.uri, CODY_IGNORE_FILENAME_POSIX_GLOB).pattern
    const ignoreFiles = await vscode.workspace.findFiles(ignoreFilePattern)
    const codebases = new Map<string, string>()
    const filesWithContent = await Promise.all(
        ignoreFiles.map(async fileUri => {
            const codebase = codebaseName || getCodebaseFromWorkspaceUri(fileUri)
            if (codebase) {
                // file root is two level above the fileUri location
                const fileRoot = dirname(dirname(fileUri.fsPath))
                const storedRoot = codebases.get(codebase)
                if (!storedRoot || storedRoot?.split('/').length > fileRoot.split('/').length) {
                    codebases.set(codebase, fileRoot)
                }
            }
            return {
                filePath: fileUri.fsPath,
                content: await tryReadFile(fileUri),
                codebase,
            }
        })
    )

    logDebug('CodyIgnore:refresh:workspace', wf.uri.fsPath)

    // Main workspace root
    ignores.setIgnoreFiles(wf.uri.fsPath, filesWithContent)
    // Nested codebases
    for (const cb of codebases) {
        ignores.setIgnoreFiles(cb[1], filesWithContent)
    }
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
    logDebug('CodyIgnore:clearIgnoreFiles:workspace', 'removed', { verbose: wf.uri.fsPath })
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
            logDebug('CodyIgnore:clearIgnoreFiles:tryReadFile', 'failed', {
                verbose: `Skipping unreadable ignore file ${fileUri}: ${error}`,
            })
            return ''
        }
    )
}

/**
 * Check if the config for enabling cody ignore is changed.
 *
 * NOTE This can be removed once cody ignore is stable.
 */
function onConfigChange(): void {
    const config = vscode.workspace.getConfiguration('cody')
    ignores.setActiveState(config.get('internal.unstable') as boolean)
}
