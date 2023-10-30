import * as os from 'os'
import * as path from 'path'

import * as vscode from 'vscode'

import { Result, SearchPanelFile, SearchPanelSnippet } from '@sourcegraph/cody-shared/src/local-context'

import { WebviewMessage } from '../chat/protocol'
import { SymfRunner } from '../local-context/symf'

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

class IndexManager {
    private currentlyRefreshing = new Set<string>()
    constructor(private symf: SymfRunner) {}

    public async refreshIndex(scopeDir: string): Promise<void> {
        if (this.currentlyRefreshing.has(scopeDir)) {
            return
        }
        try {
            this.currentlyRefreshing.add(scopeDir)

            await this.symf.deleteIndex(scopeDir)
            await this.ensureIndex(scopeDir)
        } finally {
            this.currentlyRefreshing.delete(scopeDir)
        }
    }

    private async ensureIndex(scopeDir: string): Promise<void> {
        const { base, dir, wsName } = getRenderableComponents(scopeDir)
        const prettyScopeDir = wsName ? path.join(wsName, dir, base) : path.join(dir, base)
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Cody: building search index for ${prettyScopeDir}`,
                cancellable: false,
            },
            async () => {
                await this.symf.ensureIndex(scopeDir)
            }
        )
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
        this.disposables.push(this.cancellationManager)
    }

    public dispose(): void {
        for (const d of this.disposables) {
            d.dispose()
        }
        this.disposables = []
    }

    public registerCommands(): void {
        this.disposables.push(
            vscode.commands.registerCommand('cody.search.index-update', async () => {
                const scopeDir = getCurrentWorkspaceRoot()
                if (!scopeDir) {
                    void vscode.window.showWarningMessage('Open a workspace folder to index')
                    return
                }
                await this.indexManager.refreshIndex(scopeDir)
            }),
            vscode.commands.registerCommand('cody.search.index-update-all', async () => {
                const folders = vscode.workspace.workspaceFolders
                if (!folders) {
                    void vscode.window.showWarningMessage('Open a workspace folder to index')
                    return
                }
                for (const folder of folders) {
                    await this.indexManager.refreshIndex(folder.uri.fsPath)
                }
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
        this.disposables.push(webviewView.webview.onDidReceiveMessage(message => this.onDidReceiveMessage(message)))
    }

    private async onDidReceiveMessage(message: WebviewMessage): Promise<void> {
        switch (message.command) {
            case 'search': {
                await this.onDidReceiveQuery(message.query)
                break
            }
            case 'show-search-result': {
                const { range, uriJSON } = message
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const uri = vscode.Uri.from(uriJSON as any)
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
                const isWholeFile = vscodeRange.start.line === 0 && vscodeRange.end.line === doc.lineCount - 1
                if (!isWholeFile) {
                    editor.setDecorations(searchDecorationType, [vscodeRange])
                    editor.revealRange(vscodeRange, vscode.TextEditorRevealType.InCenterIfOutsideViewport)
                }
                break
            }
        }
    }

    // TODO(beyang): support cancellation through symf
    // TODO(beyang): caching
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

        const scopeDir = getCurrentWorkspaceRoot()
        if (!scopeDir) {
            void vscode.window.showErrorMessage('Open a workspace folder to determine the search scope')
            return
        }

        // Check cancellation after index is ready
        if (cancellationToken.isCancellationRequested) {
            return
        }

        const panelResults = await vscode.window.withProgress({ location: { viewId: 'cody.search' } }, async () => {
            const results = await symf.getResults(query, scopeDir)
            const groupedResults = groupByFile(results)

            // fetch file contents to send to webview
            const textDecoder = new TextDecoder('utf-8')
            const rawPanelResults: (SearchPanelFile | null)[] = await Promise.all(
                groupedResults.map(async group => {
                    const uri = vscode.Uri.file(group.file)
                    try {
                        const contents = await vscode.workspace.fs.readFile(uri)
                        const { base, dir, wsName } = getRenderableComponents(group.file)
                        return {
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                            uriJSON: uri.toJSON(),
                            uriString: uri.toString(),
                            basename: base,
                            dirname: dir,
                            wsname: wsName,
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
                        }
                    } catch {
                        return null
                    }
                })
            )
            return rawPanelResults.filter(result => result !== null) as SearchPanelFile[]
        })

        await this.webview?.postMessage({ type: 'update-search-results', results: panelResults, query })
    }
}

function getRenderableComponents(filename: string): { base: string; dir: string; wsName?: string } {
    // get workspace folders
    const wsFolders = vscode.workspace.workspaceFolders
    const home = os.homedir()

    const base = path.basename(filename)
    const absdir = path.dirname(filename)

    if (wsFolders) {
        for (const wsFolder of wsFolders) {
            const reldir = path.relative(wsFolder.uri.fsPath, absdir)
            if (!reldir.startsWith('..')) {
                return { base, dir: reldir, wsName: wsFolders.length > 1 ? wsFolder.name : undefined }
            }
        }
    }

    // No matches in workspace folders, check home directory
    const reldir = path.relative(home, absdir)
    if (!reldir.startsWith('..')) {
        return { base, dir: reldir }
    }
    return { base, dir: absdir }
}

function getCurrentWorkspaceRoot(): string | null {
    const uri = vscode.window.activeTextEditor?.document?.uri
    if (uri) {
        const wsFolder = vscode.workspace.getWorkspaceFolder(uri)
        if (wsFolder) {
            return wsFolder.uri.fsPath
        }
    }
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null
}

function groupByFile(results: Result[]): { file: string; results: Result[] }[] {
    const groups: { file: string; results: Result[] }[] = []

    for (const result of results) {
        const group = groups.find(g => g.file === result.file)
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
