import * as vscode from 'vscode'

import { ContextGroup, ContextStatusProvider } from '@sourcegraph/cody-shared/src/codebase-context/context-status'
import { LocalEmbeddingsFetcher } from '@sourcegraph/cody-shared/src/local-context'
import { DOTCOM_URL } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'
import { EmbeddingsSearchResult } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'

import { spawnBfg } from '../graph/bfg/spawn-bfg'
import { QueryResultSet } from '../jsonrpc/embeddings-protocol'
import { MessageHandler } from '../jsonrpc/jsonrpc'
import { logDebug } from '../log'
import { captureException } from '../services/sentry/sentry'

export function createLocalEmbeddingsController(context: vscode.ExtensionContext): LocalEmbeddingsController {
    return new LocalEmbeddingsController(context)
}

export class LocalEmbeddingsController implements LocalEmbeddingsFetcher, ContextStatusProvider {
    private service: Promise<MessageHandler> | undefined
    private serviceStarted = false
    private accessToken: string | undefined
    private endpointIsDotcom = false
    private statusBar: vscode.StatusBarItem | undefined
    private lastRepo: { path: string; loadResult: boolean } | undefined

    // If indexing is in progress, the path of the repo being indexed.
    private pathBeingIndexed: string | undefined

    constructor(private readonly context: vscode.ExtensionContext) {
        logDebug('LocalEmbeddingsController', 'constructor')
    }

    // Hint that local embeddings should start cody-engine, if necessary.
    public async start(): Promise<void> {
        logDebug('LocalEmbeddingsController', 'start')
        await this.getService()
        const repoUri = vscode.workspace.workspaceFolders?.[0].uri
        if (repoUri) {
            await this.eagerlyLoad(repoUri.fsPath)
        }
    }

    public async setAccessToken(serverEndpoint: string, token: string | null): Promise<void> {
        const endpointIsDotcom = serverEndpoint === DOTCOM_URL.toString()
        logDebug('LocalEmbeddingsController', 'setAccessToken', endpointIsDotcom ? 'is dotcom' : 'not dotcom')
        if (endpointIsDotcom !== this.endpointIsDotcom) {
            // We will show, or hide, status depending on whether we are using
            // dotcom. We do not offer local embeddings to Enterprise.
            this.statusEvent.fire(this)
        }
        this.endpointIsDotcom = endpointIsDotcom
        if (token === this.accessToken) {
            return Promise.resolve()
        }
        this.accessToken = token || undefined
        // TODO: Add a "drop token" for sign out
        if (token && this.serviceStarted) {
            // TODO: Make the cody-engine reply to set-token.
            void (await this.getService()).request('embeddings/set-token', token)
        }
    }

    private getService(): Promise<MessageHandler> {
        if (!this.service) {
            this.service = this.spawnAndBindService(this.context)
        }
        return this.service
    }

    private async spawnAndBindService(context: vscode.ExtensionContext): Promise<MessageHandler> {
        const service = await new Promise<MessageHandler>((resolve, reject) => {
            spawnBfg(context, reject).then(
                bfg => resolve(bfg),
                error => {
                    captureException(error)
                    reject(error)
                }
            )
        })
        // TODO: Add more states for cody-engine fetching and trigger status updates here
        service.registerNotification('embeddings/progress', obj => {
            if (!this.statusBar) {
                return
            }
            if (typeof obj === 'object') {
                // TODO: Make clicks on this status bar item show detailed status, errors.
                if ('Progress' in obj) {
                    const percent = Math.floor((100 * obj.Progress.numItems) / obj.Progress.totalItems)
                    this.statusBar.text = `$(loading~spin) Cody Embeddings (${percent.toFixed(0)}%)`
                    this.statusBar.backgroundColor = undefined
                    this.statusBar.show()
                } else if ('Error' in obj) {
                    this.statusBar.text = '$(warning) Cody Embeddings'
                    this.statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
                    this.statusBar.show()
                }
            } else if (obj === 'Done') {
                this.statusBar.text = '$(sparkle) Cody Embeddings'
                this.statusBar.backgroundColor = undefined
                this.statusBar.show()

                // Hide this notification after a while.
                const statusBar = this.statusBar
                this.statusBar = undefined
                setTimeout(() => statusBar.hide(), 30_000)

                if (this.pathBeingIndexed && (!this.lastRepo || this.lastRepo.path === this.pathBeingIndexed)) {
                    void this.eagerlyLoad(this.pathBeingIndexed)
                }

                this.pathBeingIndexed = undefined
                this.statusEvent.fire(this)
            } else {
                // TODO(dpc): Handle these notifications.
                logDebug('LocalEmbeddingsController', JSON.stringify(obj))
                void vscode.window.showInformationMessage(JSON.stringify(obj))
            }
        })
        logDebug(
            'LocalEmbeddingsController',
            'spawnAndBindService',
            'service started, token available?',
            !!this.accessToken
        )
        if (this.accessToken) {
            // Set the initial access token
            // cody-engine does not reply to this, but we just need it to
            // happen in order.
            void service.request('embeddings/set-token', this.accessToken)
        }
        this.serviceStarted = true
        // TODO: Handle the "last codebase" as well
        return service
    }

    // ContextStatusProvider implementation

    private statusEvent: vscode.EventEmitter<ContextStatusProvider> = new vscode.EventEmitter()

    public onDidChangeStatus(callback: (provider: ContextStatusProvider) => void): vscode.Disposable {
        return this.statusEvent.event(callback)
    }

    public get status(): ContextGroup[] {
        logDebug('LocalEmbeddingsController', 'get status')
        if (!this.endpointIsDotcom) {
            // There are no local embeddings for Enterprise.
            return []
        }
        if (!this.lastRepo) {
            // TODO: We could dig up the workspace folder here and use that.
            return [
                {
                    name: 'No codebase loaded',
                    providers: [
                        {
                            kind: 'embeddings',
                            type: 'local',
                            state: 'indeterminate',
                        },
                    ],
                },
            ]
        }
        // TODO: Summarize the path with ~, etc.
        const path = this.lastRepo.path
        if (this.pathBeingIndexed === path) {
            return [
                {
                    name: path,
                    providers: [{ kind: 'embeddings', type: 'local', state: 'indexing' }],
                },
            ]
        }
        if (this.lastRepo.loadResult) {
            return [
                {
                    name: path,
                    providers: [
                        {
                            kind: 'embeddings',
                            type: 'local',
                            state: 'ready',
                        },
                    ],
                },
            ]
        }
        return [
            {
                name: path,
                providers: [
                    {
                        kind: 'embeddings',
                        type: 'local',
                        state: 'unconsented',
                    },
                ],
            },
        ]
    }

    // Interactions with cody-engine

    public async index(): Promise<void> {
        if (!(this.endpointIsDotcom && this.lastRepo?.path && !this.lastRepo?.loadResult)) {
            // TODO: Support index updates.
            logDebug('LocalEmbeddingsController', 'index: No repository to index/already indexed')
            return
        }
        const repoPath = this.lastRepo.path
        logDebug('LocalEmbeddingsController', 'index: Starting repository', repoPath)
        try {
            // TODO(dpc): Add a configuration parameter to override the embedding model for dev/testing
            const model = 'stub/stub'
            // const model = 'openai/text-embedding-ada-002'
            await (await this.getService()).request('embeddings/index', { path: repoPath, model, dimension: 1536 })
            this.pathBeingIndexed = repoPath
            this.statusBar?.dispose()
            this.statusBar = vscode.window.createStatusBarItem(
                'cody-local-embeddings',
                vscode.StatusBarAlignment.Right,
                0
            )
            this.statusEvent.fire(this)
        } catch (error) {
            logDebug('LocalEmbeddingsController', captureException(error), error)
        }
    }

    public async load(repoUri: vscode.Uri | undefined): Promise<boolean> {
        if (!this.endpointIsDotcom) {
            // Local embeddings only supported for dotcom
            return false
        }
        const repoPath = repoUri?.fsPath
        if (!repoPath) {
            // There's no path to search
            return false
        }
        if (repoPath === this.lastRepo?.path) {
            // We already tried loading this, so use that result
            return this.lastRepo.loadResult
        }
        if (!this.serviceStarted) {
            // Try starting the service but reply that there are no local
            // embeddings this time.
            void (async () => {
                try {
                    await this.getService()
                } catch (error) {
                    logDebug('LocalEmbeddingsController', 'load', captureException(error), JSON.stringify(error))
                }
            })()
            return false
        }
        return this.eagerlyLoad(repoPath)
    }

    private async eagerlyLoad(repoPath: string): Promise<boolean> {
        this.lastRepo = {
            path: repoPath,
            loadResult: await (await this.getService()).request('embeddings/load', repoPath),
        }
        this.statusEvent.fire(this)
        return this.lastRepo.loadResult
    }

    public async query(query: string): Promise<QueryResultSet> {
        if (!this.endpointIsDotcom) {
            return { results: [] }
        }
        return (await this.getService()).request('embeddings/query', query)
    }

    // LocalEmbeddingsFetcher
    public async getContext(query: string, _numResults: number): Promise<EmbeddingsSearchResult[]> {
        try {
            const results = (await this.query(query)).results
            logDebug('LocalEmbeddingsController', `returning ${results.length} results`)
            return results
        } catch (error) {
            logDebug('LocalEmbeddingsController', captureException(error), error)
            return []
        }
    }
}
