import * as vscode from 'vscode'

import { CODY_IGNORE_POSIX_GLOB, ignores, type IgnoreFileContent } from '@sourcegraph/cody-shared'

import { logDebug } from '../log'
import { StatusBar } from './StatusBar'
import type { CodySidebarTreeItem } from './treeViewItems'
import { ignoreSidebar } from '../chat/chat-view/ChatPanelsManager'

const utf8 = new TextDecoder('utf-8')

let ignoreSidebarItems: CodySidebarTreeItem[] = []
export const getIgnoreSidebarItems = () => ignoreSidebarItems.reverse()

/**
 * Parses `.code/ignore` files from the workspace and sets up a watcher to refresh
 * whenever the files change.
 *
 * NOTE: This is only called once at git extension start up time (gitAPIinit)
 */
export function setUpCodyIgnore(): vscode.Disposable {
    // Enable ignore and then handle existing workspace folders.
    onConfigChange()
    vscode.workspace.workspaceFolders?.map(async wf => await refresh(wf.uri))

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
 * The cancellation tokens for finding workspace ignore file processes.
 */
const findInProgressTokens = new Map<string, vscode.CancellationTokenSource>()

/**
 * Rebuilds the ignore files for the workspace containing `uri`.
 */
async function refresh(uri: vscode.Uri): Promise<void> {
    ignoreSidebarItems = []

    // Skip refresh if .cody/ignore is not enabled
    if (!ignores.isEnabled) {
        return
    }

    const wf = vscode.workspace.getWorkspaceFolder(uri)
    if (!wf) {
        // If this happens, we either have no workspace folder or it was removed before we started
        // processing the watch event.
        logDebug('CodyIgnore:refresh', 'failed', { verbose: 'no workspace detecetd' })
        return
    }

    // We currently only support file://. To support others, we need to change all file
    // paths in lots of places to be URIs.
    if (wf.uri.scheme !== 'file') {
        logDebug('CodyIgnore:refresh', 'failed', { verbose: 'not a file' })
        return
    }

    const cancel = () => {
        const tokenFound = findInProgressTokens.get(uri.path)
        tokenFound?.cancel()
        tokenFound?.dispose()
        findInProgressTokens.delete(uri.path)
    }

    const startTime = performance.now()
    logDebug('CodyIgnore:refresh:workspace', 'started', { verbose: wf.uri.path })

    // Cancel fileFiles process for current workspace if there is one in progress to avoid
    // having multiple find files in progress that can cause performance slow-down issues.
    cancel()

    // Set a new cancellation token for the workspace.
    const newToken = new vscode.CancellationTokenSource()
    findInProgressTokens.set(uri.path, newToken)

    // Timeout after 3 minutes to avoid causing performance issues.
    setTimeout(() => {
        // The search is already completed / canceled.
        if (!findInProgressTokens.get(uri.path)) {
            return
        }

        cancel()
        const title = 'Fail to setup Cody ignore files.'
        const description = 'Try disable the `search.followSymlinks` setting in your editor.'
        logDebug('CodyIgnore:refresh:workspace:timeout', title, { verbose: wf.uri.path })

        StatusBar.addError({
            title,
            errorType: 'CodyIgnore',
            description,
            onSelect: () => {
                // Bring up the sidebar view
                void vscode.commands.executeCommand('cody.focus')
            },
        })
    }, 180000)

    // Look for .cody/ignore files within the workspace,
    // exclude all dot files (except .cody) and common build files.
    const ignoreFilePattern = new vscode.RelativePattern(wf.uri, CODY_IGNORE_POSIX_GLOB)
    const excludePattern = '.*, **/.* ,**/{node_modules,out,build,dist}/**'
    const ignoreFiles = await vscode.workspace.findFiles(
        ignoreFilePattern,
        excludePattern,
        undefined,
        newToken.token
    )

    // Create a sidebar item for each found ignore file.
    for (const ignoreFile of ignoreFiles) {
        ignoreSidebarItems.push({
            title: vscode.workspace.asRelativePath(ignoreFile),
            icon: 'file',
            command: { command: 'vscode.open', args: [ignoreFile.path] },
        })
    }
    ignoreSidebar.refresh()

    const filesWithContent: IgnoreFileContent[] = await Promise.all(
        ignoreFiles?.map(async fileUri => ({
            uri: fileUri,
            content: await tryReadFile(fileUri),
        }))
    )

    ignores.setIgnoreFiles(wf.uri, filesWithContent)

    findInProgressTokens.delete(uri.path)
    const elapsed = performance.now() - startTime
    logDebug('CodyIgnore:refresh:workspace', `completed in ${elapsed}`, { verbose: wf.uri.path })
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

    // Remove any in-progress cancellation tokens for the workspace.
    const tokens = findInProgressTokens.values()
    for (const token of tokens) {
        token.cancel()
        token.dispose()
    }
    findInProgressTokens.clear()

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
}
