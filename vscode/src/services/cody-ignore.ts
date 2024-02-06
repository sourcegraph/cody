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
    const startTime = performance.now()
    logDebug('CodyIgnore:refresh:workspace', 'started', { verbose: wf.uri.path })

    // Cancel fileFiles process for current workspace if there is one in progress to avoid
    // having multiple find files in progress that can cause performance slow-down issues.
    const findFilesInProgressToken = findInProgressTokens.get(uri.path)
    findFilesInProgressToken?.cancel()
    findFilesInProgressToken?.dispose()

    // Set a new cancellation token for the workspace.
    const newToken = new vscode.CancellationTokenSource()
    findInProgressTokens.set(uri.path, newToken)

    // TODO (bee) Cancel the search after n minutes if it's taking too long.
    // Get the codebase name from the git clone URL on each refresh
    // NOTE: This is needed because the ignore rules are mapped to workspace addresses at creation time,
    // we will need to map the name of the codebase to each workspace for us to map the embedding results
    // returned for a specific codebase by the search API to the correct workspace later.
    const ignoreFilePattern = new vscode.RelativePattern(wf.uri, CODY_IGNORE_POSIX_GLOB)
    // exclude all dot files (except .cody) and node_modules files
    const excludePattern = '.*, **/.* ,**/node_modules/**'
    const ignoreFiles = await vscode.workspace.findFiles(
        ignoreFilePattern,
        excludePattern,
        undefined,
        newToken.token
    )

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
    logDebug('CodyIgnore:onConfigChange', 'isEnabled', { verbose: isEnabled })
}
