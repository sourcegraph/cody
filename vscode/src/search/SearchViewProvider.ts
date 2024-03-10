import * as vscode from 'vscode'

import {
    type FileURI,
    type Result,
    type SearchPanelFile,
    type SearchPanelSnippet,
    displayPath,
    hydrateAfterPostMessage,
    isDefined,
    isFileURI,
} from '@sourcegraph/cody-shared'

import type { ExtensionMessage, WebviewMessage } from '../chat/protocol'
import { getEditor } from '../editor/active-editor'
import type { IndexStartEvent, SymfRunner } from '../local-context/symf'

const searchDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('searchEditor.findMatchBackground'),
    borderColor: new vscode.ThemeColor('searchEditor.findMatchBorder'),
})

class CancellationManager implements vscode.Disposable {
    private tokenSource?: vscode.CancellationTokenSource

    public cancelExistingAndStartNew(): vscode.CancellationToken {
        if (this.tokenSource) {
            this.tokenSource.cancel()
            this.tokenSource.dispose()
        }
        this.tokenSource = new vscode.CancellationTokenSource()
        return this.tokenSource.token
    }

    public dispose(): void {
        if (this.tokenSource) {
            const ts = this.tokenSource
            this.tokenSource = undefined
            ts.cancel()
            ts.dispose()
        }
    }
}

class IndexManager implements vscode.Disposable {
    private currentlyRefreshing = new Map<string /* uri.toString() */, Promise<void>>()
    private scopeDirIndexInProgress: Map<string /* uri.toString() */, Promise<void>> = new Map()
    private disposables: vscode.Disposable[] = []

    constructor(private symf: SymfRunner) {
        this.disposables.push(this.symf.onIndexStart(event => this.showIndexProgress(event)))
    }

    public dispose(): void {
        vscode.Disposable.from(...this.disposables).dispose()
    }

    /**
     * Show a warning message if indexing is already in progress for scopeDirs.
     * This is needed, because the user may have dismissed previous indexing progress
     * messages.
     */
    public showMessageIfIndexingInProgress(scopeDirs: vscode.Uri[]): void {
        const indexingScopeDirs: vscode.Uri[] = []
        for (const scopeDir of scopeDirs) {
            if (this.scopeDirIndexInProgress.has(scopeDir.toString())) {
                indexingScopeDirs.push(scopeDir)
            }
        }
        if (indexingScopeDirs.length === 0) {
            return
        }
        void vscode.window.showWarningMessage(
            `Still indexing: ${indexingScopeDirs.map(displayPath).join(', ')}`
        )
    }

    public showIndexProgress({ scopeDir, cancel, done }: IndexStartEvent): void {
        if (this.scopeDirIndexInProgress.has(scopeDir.toString())) {
            void vscode.window.showWarningMessage(`Duplicate index request for ${displayPath(scopeDir)}`)
            return
        }
        this.scopeDirIndexInProgress.set(scopeDir.toString(), done)
        void done.finally(() => {
            this.scopeDirIndexInProgress.delete(scopeDir.toString())
        })

        void vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Updating Cody search index for ${displayPath(scopeDir)}`,
                cancellable: true,
            },
            async (_progress, token) => {
                if (token.isCancellationRequested) {
                    cancel()
                } else {
                    token.onCancellationRequested(() => cancel())
                }
                await done
            }
        )
    }

    public refreshIndex(scopeDir: FileURI): Promise<void> {
        const fromCache = this.currentlyRefreshing.get(scopeDir.toString())
        if (fromCache) {
            return fromCache
        }
        const result = this.forceRefreshIndex(scopeDir)
        this.currentlyRefreshing.set(scopeDir.toString(), result)
        return result
    }

    private async forceRefreshIndex(scopeDir: FileURI): Promise<void> {
        try {
            await this.symf.deleteIndex(scopeDir)
            await this.symf.ensureIndex(scopeDir, {
                retryIfLastAttemptFailed: true,
                ignoreExisting: false,
            })
        } catch (error) {
            if (!(error instanceof vscode.CancellationError)) {
                void vscode.window.showErrorMessage(
                    `Error refreshing search index for ${displayPath(scopeDir)}: ${error}`
                )
            }
        } finally {
            this.currentlyRefreshing.delete(scopeDir.toString())
        }
    }
}

export class SearchViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private webview?: vscode.Webview
    private cancellationManager = new CancellationManager()
    private indexManager: IndexManager

    constructor(
        private extensionUri: vscode.Uri,
        private symfRunner: SymfRunner
    ) {
        this.indexManager = new IndexManager(this.symfRunner)
        this.disposables.push(this.indexManager)
        this.disposables.push(this.cancellationManager)
    }

    public dispose(): void {
        for (const d of this.disposables) {
            d.dispose()
        }
        this.disposables = []
    }

    public initialize(): void {
        this.disposables.push(
            vscode.commands.registerCommand('cody.search.index-update', async () => {
                const scopeDirs = getScopeDirs()
                if (scopeDirs.length === 0) {
                    void vscode.window.showWarningMessage('Open a workspace folder to index')
                    return
                }
                await this.indexManager.refreshIndex(scopeDirs[0])
            }),
            vscode.commands.registerCommand('cody.search.index-update-all', async () => {
                const folders = vscode.workspace.workspaceFolders
                    ?.map(folder => folder.uri)
                    .filter(isFileURI)
                if (!folders) {
                    void vscode.window.showWarningMessage('Open a workspace folder to index')
                    return
                }
                for (const folder of folders) {
                    await this.indexManager.refreshIndex(folder)
                }
            })
        )
        // Kick off search index creation for all workspace folders
        if (vscode.workspace.workspaceFolders) {
            for (const folder of vscode.workspace.workspaceFolders) {
                if (isFileURI(folder.uri)) {
                    void this.symfRunner.ensureIndex(folder.uri, {
                        retryIfLastAttemptFailed: false,
                        ignoreExisting: false,
                    })
                }
            }
        }
        this.disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(event => {
                for (const folder of event.added) {
                    if (isFileURI(folder.uri)) {
                        void this.symfRunner.ensureIndex(folder.uri, {
                            retryIfLastAttemptFailed: false,
                            ignoreExisting: false,
                        })
                    }
                }
            })
        )
        this.disposables.push(
            this.symfRunner.onIndexEnd(({ scopeDir }) => {
                void this.webview?.postMessage({ type: 'index-updated', scopeDir })
            })
        )
    }

    public async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
        this.webview = webviewView.webview
        const webviewPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webviews')

        webviewView.webview.options = {
            enableScripts: true,
            enableCommandUris: true,
            localResourceRoots: [webviewPath],
        }

        // Create Webview using vscode/index.html
        const root = vscode.Uri.joinPath(webviewPath, 'search.html')
        const bytes = await vscode.workspace.fs.readFile(root)
        const decoded = new TextDecoder('utf-8').decode(bytes)
        const resources = webviewView.webview.asWebviewUri(webviewPath)

        // Set HTML for webview
        // This replace variables from the vscode/dist/index.html with webview info
        // 1. Update URIs to load styles and scripts into webview (eg. path that starts with ./)
        // 2. Update URIs for content security policy to only allow specific scripts to be run
        webviewView.webview.html = decoded
            .replaceAll('./', `${resources.toString()}/`)
            .replaceAll('{cspSource}', webviewView.webview.cspSource)

        // Register to receive messages from webview
        this.disposables.push(
            webviewView.webview.onDidReceiveMessage(message =>
                this.onDidReceiveMessage(
                    hydrateAfterPostMessage(message, uri => vscode.Uri.from(uri as any))
                )
            )
        )
    }

    private async onDidReceiveMessage(message: WebviewMessage): Promise<void> {
        switch (message.command) {
            case 'search': {
                await this.onDidReceiveQuery(message.query)
                break
            }
            case 'show-search-result': {
                const { range, uri } = message
                const vscodeRange = new vscode.Range(
                    range.start.line,
                    range.start.character,
                    range.end.line,
                    range.end.character
                )

                // show file and range in editor
                const doc = await vscode.workspace.openTextDocument(uri)
                const editor = await vscode.window.showTextDocument(doc, {
                    selection: vscodeRange,
                    preserveFocus: true,
                })
                const isWholeFile =
                    vscodeRange.start.line === 0 && vscodeRange.end.line === doc.lineCount - 1
                if (!isWholeFile) {
                    editor.setDecorations(searchDecorationType, [vscodeRange])
                    editor.revealRange(
                        vscodeRange,
                        vscode.TextEditorRevealType.InCenterIfOutsideViewport
                    )
                }
                break
            }
        }
    }

    // TODO(beyang): support cancellation through symf
    private async onDidReceiveQuery(query: string): Promise<void> {
        const cancellationToken = this.cancellationManager.cancelExistingAndStartNew()

        if (query.trim().length === 0) {
            await this.webview?.postMessage({ type: 'update-search-results', results: [] })
            return
        }

        const symf = this.symfRunner
        if (!symf) {
            throw new Error('this.symfRunner is undefined')
        }

        const scopeDirs = getScopeDirs()
        if (scopeDirs.length === 0) {
            void vscode.window.showErrorMessage('Open a workspace folder to determine the search scope')
            return
        }

        // Check cancellation after index is ready
        if (cancellationToken.isCancellationRequested) {
            return
        }

        // Update the config. We could do this on a smarter schedule, but this suffices for when the
        // webview needs it for now.
        this.webview?.postMessage({
            type: 'search:config',
            workspaceFolderUris:
                vscode.workspace.workspaceFolders?.map(folder => folder.uri.toString()) ?? [],
        } satisfies ExtensionMessage)

        await vscode.window.withProgress({ location: { viewId: 'cody.search' } }, async () => {
            const cumulativeResults: SearchPanelFile[] = []
            this.indexManager.showMessageIfIndexingInProgress(scopeDirs)
            const resultSets = await symf.getResults(query, scopeDirs)
            for (const resultSet of resultSets) {
                try {
                    cumulativeResults.push(...(await resultsToDisplayResults(await resultSet)))
                    await this.webview?.postMessage({
                        type: 'update-search-results',
                        results: cumulativeResults,
                        query,
                    })
                } catch (error) {
                    if (error instanceof vscode.CancellationError) {
                        void vscode.window.showErrorMessage(
                            'No search results because indexing was canceled'
                        )
                    } else {
                        void vscode.window.showErrorMessage(
                            `Error fetching results for query "${query}": ${error}`
                        )
                    }
                }
            }
        })
    }
}

/**
 * @returns the list of workspace folders to search. The first folder is the active file's folder.
 */
function getScopeDirs(): FileURI[] {
    const folders = vscode.workspace.workspaceFolders?.map(f => f.uri).filter(isFileURI)
    if (!folders) {
        return []
    }
    const uri = getEditor().active?.document.uri
    if (!uri) {
        return folders
    }
    const currentFolder = vscode.workspace.getWorkspaceFolder(uri)
    if (!currentFolder) {
        return folders
    }

    return [
        isFileURI(currentFolder.uri) ? currentFolder.uri : undefined,
        ...folders.filter(folder => folder.toString() !== currentFolder.uri.toString()),
    ].filter(isDefined)
}

function groupByFile(results: Result[]): { file: vscode.Uri; results: Result[] }[] {
    const groups: { file: vscode.Uri; results: Result[] }[] = []

    for (const result of results) {
        const group = groups.find(g => g.file.toString() === result.file.toString())
        if (group) {
            group.results.push(result)
        } else {
            groups.push({
                file: result.file,
                results: [result],
            })
        }
    }
    return groups
}

async function resultsToDisplayResults(results: Result[]): Promise<SearchPanelFile[]> {
    const textDecoder = new TextDecoder('utf-8')
    const groupedResults = groupByFile(results)
    return (
        await Promise.all(
            groupedResults.map(async group => {
                try {
                    const contents = await vscode.workspace.fs.readFile(group.file)
                    return {
                        uri: group.file,
                        snippets: group.results.map((result: Result): SearchPanelSnippet => {
                            return {
                                contents: textDecoder.decode(
                                    contents.subarray(result.range.startByte, result.range.endByte)
                                ),
                                range: {
                                    start: {
                                        line: result.range.startPoint.row,
                                        character: result.range.startPoint.col,
                                    },
                                    end: {
                                        line: result.range.endPoint.row,
                                        character: result.range.endPoint.col,
                                    },
                                },
                            }
                        }),
                    } satisfies SearchPanelFile
                } catch {
                    return null
                }
            })
        )
    ).filter(result => result !== null) as SearchPanelFile[]
}
