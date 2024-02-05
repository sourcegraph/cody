import * as vscode from 'vscode'

import { CODY_IGNORE_POSIX_GLOB, ignores, type IgnoreFileContent } from '@sourcegraph/cody-shared'

import { logDebug } from '../log'

const utf8 = new TextDecoder('utf-8')

/**
 * Parses `.code/ignore` files from the workspace and sets up a watcher to refresh
 * whenever the files change.
 *
 * NOTE: This is only called once at git extension start up time (gitAPIinit)
 */
export function setUpCodyIgnore(): vscode.Disposable {
    onConfigChange()
    const initWorkspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri
    if (initWorkspaceUri) {
        refresh(initWorkspaceUri)
    }

    // Refresh ignore rules when any ignore file in the workspace changes.
    const watcher = vscode.workspace.createFileSystemWatcher(CODY_IGNORE_POSIX_GLOB)
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
        logDebug('CodyIgnore:refresh', 'workspace', { verbose: 'no workspace detecetd' })
        return
    }

    // We currently only support file://. To support others, we need to change all file
    // paths in lots of places to be URIs.
    if (wf.uri.scheme !== 'file') {
        logDebug('CodyIgnore:refresh', 'file', { verbose: 'not a file' })
        return
    }

    // At v1, we only support .cody/ignore at the workspace root.
    // This is because searching for nested .cody/ignore files via
    // findFiles can be expensive in a monorepos and cause slowness for users.
    const wsRootIgnoreFile = vscode.Uri.joinPath(wf.uri, CODY_IGNORE_POSIX_GLOB)
    const ignoreFiles = [wsRootIgnoreFile]
    try {
        const filesWithContent: IgnoreFileContent[] = await Promise.all(
            ignoreFiles?.map(async fileUri => ({
                uri: fileUri,
                content: await tryReadFile(fileUri),
            }))
        )

        ignores.setIgnoreFiles(wf.uri, filesWithContent)
        logDebug('CodyIgnore:refresh:workspace', wf.uri.path)
    } catch {
        logDebug('CodyIgnore:refresh:workspace', wf.uri.path, { verbose: 'failed to read ignore file' })
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

    ignores.clearIgnoreFiles(wf.uri)
    logDebug('CodyIgnore:clearIgnoreFiles:workspace', 'removed', { verbose: wf.uri.toString() })
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
    const isEnabled = config.get('internal.unstable') as boolean
    ignores.setActiveState(isEnabled)
    logDebug('CodyIgnore:onConfigChange', 'isEnabled', { verbose: isEnabled })
}
