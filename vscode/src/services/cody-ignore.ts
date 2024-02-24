import * as vscode from 'vscode'

import {
    CODY_IGNORE_POSIX_GLOB,
    type ConfigurationWithAccessToken,
    type IgnoreFileContent,
    ignores,
} from '@sourcegraph/cody-shared'

import { logDebug } from '../log'

const utf8 = new TextDecoder('utf-8')

/**
 * Parses `.code/ignore` files from the workspace and sets up a watcher to refresh
 * whenever the files change.
 *
 * NOTE: Execute ONCE at extension activation time.
 */
export function setUpCodyIgnore(config: ConfigurationWithAccessToken): vscode.Disposable[] {
    ignores.setActiveState(config.internalUnstable)
    if (!config.internalUnstable) {
        return []
    }

    // Enable ignore and then handle existing workspace folders.
    vscode.workspace.workspaceFolders?.map(async wf => await refresh(wf.uri))

    const disposables: vscode.Disposable[] = []

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

    const onDidChangeConfig = vscode.workspace.onDidChangeConfiguration(e => {
        // NOTE This can be removed once cody ignore is stable.
        if (e.affectsConfiguration('cody')) {
            onConfigChange()
        }
        // NOTE This allows us to search for the ignore files again
        // if the user changes the search.symlinks setting.
        if (e.affectsConfiguration('search')) {
            // Only refresh if the ignore sidebar is empty,
            // which means the setup step has initially failed.
            if (ignores.isActive && !ignores.hasCodyIgnoreFiles) {
                onConfigChange()
            }
        }
    })

    disposables.push(...[watcher, didChangeSubscription, onDidChangeConfig])
    return disposables
}

/**
 * The cancellation tokens for finding workspace ignore file processes.
 */
const findInProgressTokens = new Map<string, vscode.CancellationTokenSource>()

/**
 * Refreshes the ignore rules for the given workspace URI by searching
 * for `.cody/ignore` files and reading their contents. This allows
 * dynamically updating the ignore rules as ignore files are added/removed.
 *
 * Cancels any existing findFiles processes for the workspace to avoid
 * multiple concurrent processes. Also sets a timeout of 1 min to avoid long running
 * processes.
 */
async function refresh(uri: vscode.Uri): Promise<void> {
    // Skip refresh if .cody/ignore is not enabled
    if (!ignores.isActive) {
        return
    }

    const wf = vscode.workspace.getWorkspaceFolder(uri)
    const cancel = () => {
        const tokenFound = findInProgressTokens.get(uri.path)
        tokenFound?.cancel()
        tokenFound?.dispose()
        findInProgressTokens.delete(uri.path)
    }

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
    logDebug('CodyIgnore:refresh', 'started', { verbose: startTime })

    // Cancel fileFiles process for current workspace if there is one in progress to avoid
    // having multiple find files in progress that can cause performance slow-down issues.
    cancel()

    // Set a new cancellation token for the workspace.
    const newToken = new vscode.CancellationTokenSource()
    findInProgressTokens.set(uri.path, newToken)

    // Timeout after 1 minutes to avoid causing performance issues.
    setTimeout(
        () => {
            // The search is already completed / canceled if no token is found.
            if (findInProgressTokens.get(uri.path)) {
                cancel()
                // TODO locate ignore file from codebase root instead of workspace
                // Try looking for ignore file at workspace root as fallback.
                const ignoreFileAtRoot = vscode.Uri.joinPath(wf.uri, '.cody', 'ignore')
                tryReadFile(ignoreFileAtRoot).then(content => {
                    if (content.length) {
                        ignores.setIgnoreFiles(wf.uri, [{ uri: ignoreFileAtRoot, content }])
                        logDebug('CodyIgnore:refresh', 'found ignore file at root', {
                            verbose: wf.uri.path,
                        })
                        return
                    }
                    const title = 'Failed to locate Cody ignore files in current workspace.'
                    const description = 'Try disable the `search.followSymlinks` setting in your editor.'
                    const message = `${title} ${description}`
                    logDebug('CodyIgnore:refresh:failed', message, { verbose: wf.uri.path })
                })
            }
            return
        },
        1 * 60 * 1000 // 1 minute
    )

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
    const filesWithContent: IgnoreFileContent[] = await Promise.all(
        ignoreFiles?.map(async fileUri => ({
            uri: fileUri,
            content: await tryReadFile(fileUri),
        }))
    )
    ignores.setIgnoreFiles(wf.uri, filesWithContent)

    // If we can locate the token, that means the job was completed before it times out.
    if (findInProgressTokens.get(uri.path)) {
        findInProgressTokens.delete(uri.path)
        const elapsed = performance.now() - startTime
        logDebug('CodyIgnore:refresh', `refresh completed in ${elapsed}`, { verbose: wf.uri.path })
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
