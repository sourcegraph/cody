import * as vscode from 'vscode'

import {
    type FileURI,
    PromptString,
    type Result,
    type SearchPanelFile,
    type SearchPanelSnippet,
    displayPath,
    isDefined,
    isFileURI,
    logDebug,
    toRangeData,
    uriBasename,
} from '@sourcegraph/cody-shared'
import { getEditor } from '../editor/active-editor'
import type { IndexStartEvent, SymfRunner } from '../local-context/symf'

interface SymfResultQuickPickItem extends vscode.QuickPickItem {
    onSelect: () => void
}

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
                title: `Updating Cody search index for ${uriBasename(scopeDir)}`,
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

export class SearchViewProvider implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private cancellationManager = new CancellationManager()
    private indexManager: IndexManager

    constructor(private symfRunner: SymfRunner) {
        this.indexManager = new IndexManager(this.symfRunner)
        this.disposables.push(this.indexManager, this.cancellationManager)
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
            }),
            vscode.commands.registerCommand('cody.symf.search', q => {
                q ? this.onDidReceiveQuery(q) : this.getSearchQueryInput()
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
    }

    private async getSearchQueryInput(): Promise<void> {
        const quickPick = vscode.window.createQuickPick()
        quickPick.placeholder =
            'Search… (e.g. "password hashing", "connection retries", a symbol name, or a topic)'
        quickPick.items = []
        quickPick.title = 'Natural Language Code Search (Beta)'
        quickPick.buttons = searchQuickPickButtons
        quickPick.matchOnDescription = false
        quickPick.matchOnDetail = false
        quickPick.onDidAccept(() => {
            const input = quickPick.value
            quickPick.hide()
            if (input?.trim()) {
                this.onDidReceiveQuery(PromptString.unsafe_fromUserQuery(input.trim()))
            }
        })

        quickPick.show()
    }

    // TODO(beyang): support cancellation through symf
    private async onDidReceiveQuery(queryPromptString: PromptString): Promise<void> {
        const cancellationToken = this.cancellationManager.cancelExistingAndStartNew()
        if (cancellationToken.isCancellationRequested) {
            return
        }

        const symf = this.symfRunner
        if (!symf) {
            logDebug('SearchViewProvider', 'symfRunner is not available')
            throw new Error('Search is not available')
        }

        const scopeDirs = getScopeDirs()
        if (scopeDirs.length === 0) {
            throw new Error('Please open a workspace folder for search')
        }

        if (!(queryPromptString instanceof PromptString)) {
            return this.getSearchQueryInput()
        }

        const query = queryPromptString?.toString()?.trim()
        const quickPick = vscode.window.createQuickPick()
        quickPick.items = []
        quickPick.busy = true
        quickPick.title = `Search Results for "${query}"`
        quickPick.placeholder = 'Searching...'
        quickPick.matchOnDescription = true
        quickPick.matchOnDetail = true
        quickPick.ignoreFocusOut = true
        quickPick.buttons = searchQuickPickButtons
        quickPick.onDidAccept(() => (quickPick.selectedItems[0] as SymfResultQuickPickItem)?.onSelect())

        quickPick.show()

        try {
            const cumulativeResults: SearchPanelFile[] = []
            for (const resultSet of await symf.getResults(queryPromptString, scopeDirs)) {
                cumulativeResults.push(...(await resultsToDisplayResults(await resultSet)))
            }

            const items = cumulativeResults.flatMap(file =>
                file.snippets.map(s => ({
                    label: uriBasename(file.uri),
                    description: `Lines ${s.range.start.line}-${s.range.end.line}`,
                    detail: s.contents.trim()?.split('\n')?.[0],
                    file,
                    onSelect: () => {
                        vscode.workspace.openTextDocument(file.uri).then(async doc => {
                            vscode.window.showTextDocument(doc, {
                                preserveFocus: true,
                                selection: new vscode.Range(
                                    s.range.start.line,
                                    s.range.start.character,
                                    s.range.end.line,
                                    s.range.end.character
                                ),
                            })
                        })
                    },
                }))
            )

            quickPick.items = items
            quickPick.placeholder = 'Filter search results. Press ESC to close.'

            quickPick.onDidChangeValue(_value => {
                if (_value && !quickPick.activeItems.length) {
                    // Add new item to display warning about no matches
                    quickPick.items = [
                        { label: `No results for "${_value}"`, detail: 'Try a different query' },
                    ]
                    return
                }

                // Reset items to original list of results
                if (quickPick.items.length !== items.length) {
                    quickPick.items = items
                }
            })
            quickPick.busy = false
        } catch (error) {
            const label = `Error fetching results for "${query}"`
            const detail =
                error instanceof vscode.CancellationError
                    ? 'No search results because indexing was canceled'
                    : `${error}`
            logDebug('SearchViewProvider', `${label}: ${detail}`)
            quickPick.items = [{ label, detail }]
            quickPick.busy = false
        }
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
                                range: toRangeData([
                                    {
                                        line: result.range.startPoint.row,
                                        character: result.range.startPoint.col,
                                    },
                                    {
                                        line: result.range.endPoint.row,
                                        character: result.range.endPoint.col,
                                    },
                                ]),
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

const searchQuickPickButtons = [
    {
        iconPath: new vscode.ThemeIcon('refresh'),
        tooltip: 'Update search index for current workspace folder',
    },
    {
        iconPath: new vscode.ThemeIcon('sync'),
        tooltip: 'Update search indices for all workspace folders',
    },
]
