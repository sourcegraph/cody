import type { GetFieldType } from 'lodash'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

import {
    type AuthCredentials,
    type ClientConfigurationWithAccessToken,
    type EmbeddingsModelConfig,
    type EmbeddingsSearchResult,
    FeatureFlag,
    type FileURI,
    type LocalEmbeddingsFetcher,
    type LocalEmbeddingsProvider,
    type PromptString,
    type ResolvedConfiguration,
    type Unsubscribable,
    distinctUntilChanged,
    featureFlagProvider,
    firstValueFrom,
    isDotCom,
    isFileURI,
    pluck,
    recordErrorToSpan,
    telemetryRecorder,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'

import type { Observable } from 'observable-fns'
import type { IndexHealthResultFound, IndexRequest } from '../jsonrpc/embeddings-protocol'
import type { MessageHandler } from '../jsonrpc/jsonrpc'
import { logDebug } from '../log'
import { vscodeGitAPI } from '../repository/git-extension-api'
import { captureException } from '../services/sentry/sentry'
import { CodyEngineService } from './cody-engine'

export async function createLocalEmbeddingsController(
    context: vscode.ExtensionContext,
    config: Observable<ResolvedConfiguration>
): Promise<LocalEmbeddingsController> {
    const { configuration } = await firstValueFrom(config)
    const modelConfig =
        configuration.testingModelConfig ||
        (await featureFlagProvider.instance!.evaluateFeatureFlag(
            FeatureFlag.CodyEmbeddingsGenerateMetadata
        ))
            ? sourcegraphMetadataModelConfig
            : sourcegraphModelConfig

    return new LocalEmbeddingsController(context, config, modelConfig)
}

export type LocalEmbeddingsConfig = Pick<
    ClientConfigurationWithAccessToken,
    'serverEndpoint' | 'accessToken'
> & {
    testingModelConfig: EmbeddingsModelConfig | undefined
}

const CODY_GATEWAY_PROD_ENDPOINT = 'https://cody-gateway.sourcegraph.com/v1/embeddings'

function getIndexLibraryPath(modelSuffix: string): FileURI {
    switch (process.platform) {
        case 'darwin':
            return URI.file(
                `${process.env.HOME}/Library/Caches/com.sourcegraph.cody/embeddings` +
                    (modelSuffix === '' ? '' : '/' + modelSuffix)
            )
        case 'linux':
            return URI.file(
                `${process.env.HOME}/.cache/com.sourcegraph.cody/embeddings` +
                    (modelSuffix === '' ? '' : '/' + modelSuffix)
            )
        case 'win32':
            return URI.file(
                `${process.env.LOCALAPPDATA}\\com.sourcegraph.cody\\embeddings` +
                    (modelSuffix === '' ? '' : '\\' + modelSuffix)
            )
        default:
            throw new Error(`Unsupported platform: ${process.platform}`)
    }
}

interface RepoState {
    repoName: string | false
    indexable: boolean
    errorReason: GetFieldType<LocalEmbeddingsProvider, 'errorReason'>
}

const sourcegraphModelConfig: EmbeddingsModelConfig = {
    model: 'sourcegraph/st-multi-qa-mpnet-base-dot-v1',
    dimension: 768,
    provider: 'sourcegraph',
    endpoint: CODY_GATEWAY_PROD_ENDPOINT,
    indexPath: getIndexLibraryPath('st-v1'),
}

const sourcegraphMetadataModelConfig: EmbeddingsModelConfig = {
    model: 'sourcegraph/st-multi-qa-mpnet-metadata',
    dimension: 768,
    provider: 'sourcegraph',
    endpoint: CODY_GATEWAY_PROD_ENDPOINT,
    indexPath: getIndexLibraryPath('st-metadata'),
}

export class LocalEmbeddingsController implements LocalEmbeddingsFetcher, vscode.Disposable {
    private disposables: vscode.Disposable[] = []

    // The cody-engine child process, if starting or started.
    private service: Promise<MessageHandler> | undefined
    // True if the service has finished starting and been initialized.
    private serviceStarted = false
    // The last index we loaded, or attempted to load, if any.
    private lastRepo: { dir: FileURI; repoName: string | false } | undefined
    // The last health report, if any.
    private lastHealth: IndexHealthResultFound | undefined
    // The time of the last health report, if any.
    private lastHealthTime: number | undefined
    // The last error from indexing, if any.
    private lastError: string | undefined
    // Map of cached states for loaded indexes.
    private repoState: Map<string /* uri.toString() */, RepoState> = new Map()
    // If indexing is in progress, the path of the repo being indexed.
    private dirBeingIndexed: FileURI | undefined

    // The status bar item local embeddings is displaying, if any.
    private statusBar: vscode.StatusBarItem | undefined

    // Fires when available local embeddings (may) have changed. This updates
    // the codebase context, which touches the network and file system, so only
    // use it for major changes like local embeddings being available at all,
    // or the first index for a repository comes online.
    private readonly changeEmitter = new vscode.EventEmitter<LocalEmbeddingsController>()

    private configSubscription: Unsubscribable

    constructor(
        private readonly context: vscode.ExtensionContext,
        private config: Observable<ResolvedConfiguration>,
        private readonly modelConfig: EmbeddingsModelConfig
    ) {
        logDebug('LocalEmbeddingsController', 'constructor')
        this.disposables.push(this.changeEmitter)
        this.disposables.push(
            vscode.commands.registerCommand('cody.embeddings.resolveIssue', () =>
                this.resolveIssueCommand()
            )
        )

        this.configSubscription = config
            .pipe(pluck('auth'), distinctUntilChanged())
            .subscribe(auth => this.setAuth(auth))
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.statusBar?.dispose()
        this.configSubscription.unsubscribe()
    }

    public get onChange(): vscode.Event<LocalEmbeddingsController> {
        return this.changeEmitter.event
    }

    // Hint that local embeddings should start cody-engine, if necessary.
    public async start(): Promise<void> {
        logDebug('LocalEmbeddingsController', 'start')
        wrapInActiveSpan('embeddings.start', async span => {
            span.setAttribute('sampled', true)
            span.setAttribute('provider', this.modelConfig.provider)
            await this.getService()
            const repoUri = vscode.workspace.workspaceFolders?.[0]?.uri
            if (repoUri && isFileURI(repoUri)) {
                span.setAttribute('hasRepo', true)
                const loadedOk = await this.eagerlyLoad(repoUri)
                span.setAttribute('loadedOk', loadedOk)
                if (!loadedOk) {
                    // failed to load the index, let's see if we should start indexing
                    if (this.canAutoIndex()) {
                        span.setAttribute('autoIndex', true)
                        this.index()
                    }
                }
            }
        })
    }

    private _auth: AuthCredentials | null = null
    private async setAuth(auth: AuthCredentials): Promise<void> {
        this._auth = auth

        const endpointIsDotcom = isDotCom(auth.serverEndpoint)
        logDebug(
            'LocalEmbeddingsController',
            'setAccessToken',
            endpointIsDotcom ? 'is dotcom' : 'not dotcom'
        )

        // We will show, or hide, status depending on whether we are using
        // dotcom. We do not offer local embeddings to Enterprise.
        if (this.serviceStarted) {
            this.changeEmitter.fire(this)
        }
        // TODO: Add a "drop token" for sign out
        if (token && this.serviceStarted) {
            await (await this.getService()).request('embeddings/set-token', token)
        }
    }

    private getService(): Promise<MessageHandler> {
        if (!this.service) {
            const instance = CodyEngineService.getInstance(this.context)
            this.service = instance.getService(this.setupLocalEmbeddingsService)
        }
        return this.service
    }

    private setupLocalEmbeddingsService = async (service: MessageHandler): Promise<void> => {
        // TODO: Add more states for cody-engine fetching and trigger status updates here
        service.registerNotification('embeddings/progress', obj => {
            if (typeof obj === 'object') {
                switch (obj.type) {
                    case 'progress': {
                        this.lastError = undefined
                        const percent = Math.floor((100 * obj.numItems) / obj.totalItems)
                        if (this.statusBar) {
                            this.statusBar.text = `Indexing Embeddings… (${percent.toFixed(0)}%)`
                            this.statusBar.backgroundColor = undefined
                            this.statusBar.tooltip = obj.currentPath
                            this.statusBar.show()
                        }
                        return
                    }
                    case 'error': {
                        this.lastError = obj.message
                        this.loadAfterIndexing()
                        return
                    }
                    case 'done': {
                        this.lastError = undefined
                        this.loadAfterIndexing()
                        return
                    }
                }
            }
            logDebug('LocalEmbeddingsController', 'unknown notification', JSON.stringify(obj))
        })

        logDebug('LocalEmbeddingsController', 'spawnAndBindService', 'service started, initializing')

        const initResult = await service.request('embeddings/initialize', {
            codyGatewayEndpoint: this.modelConfig.endpoint,
            indexPath: this.modelConfig.indexPath.fsPath,
        })
        logDebug('LocalEmbeddingsController', 'spawnAndBindService', 'initialized', {
            verbose: {
                initResult,
                tokenAvailable: !!this._auth?.accessToken,
            },
        })

        if (this._auth?.accessToken) {
            // Set the initial access token
            await service.request('embeddings/set-token', this._auth?.accessToken)
        }
        this.serviceStarted = true
        this.changeEmitter.fire(this)
    }

    // After indexing succeeds or fails, try to load the index. Update state
    // indicating we are no longer loading the index.
    private loadAfterIndexing(): void {
        if (
            this.dirBeingIndexed &&
            (!this.lastRepo || this.lastRepo.dir.toString() === this.dirBeingIndexed.toString())
        ) {
            const path = this.dirBeingIndexed
            void (async () => {
                const loadedOk = await this.eagerlyLoad(path)
                logDebug('LocalEmbeddingsController', 'load after indexing "done"', path, loadedOk)
                this.changeEmitter.fire(this)
                if (loadedOk && !this.lastError) {
                    await vscode.window.showInformationMessage('✨ Cody Embeddings Index Complete')
                }
            })()
        }

        if (this.statusBar) {
            this.statusBar.dispose()
            this.statusBar = undefined
        }

        this.dirBeingIndexed = undefined
    }

    // Interactions with cody-engine

    public async index(): Promise<void> {
        const { auth } = await firstValueFrom(this.config)
        const endpointIsDotCom = isDotCom(auth.serverEndpoint)
        if (!(endpointIsDotCom && this.lastRepo?.dir && !this.lastRepo?.repoName)) {
            // TODO: Support index updates.
            logDebug('LocalEmbeddingsController', 'index', 'no repository to index/already indexed')
            return
        }
        const repoPath = this.lastRepo.dir
        logDebug('LocalEmbeddingsController', 'index', 'starting repository', repoPath)
        await this.indexRequest({
            repoPath: repoPath.fsPath,
            mode: { type: 'new', model: this.modelConfig.model, dimension: this.modelConfig.dimension },
        })
    }

    public async indexRetry(): Promise<void> {
        const { auth } = await firstValueFrom(this.config)
        const endpointIsDotCom = isDotCom(auth.serverEndpoint)
        if (!(endpointIsDotCom && this.lastRepo?.dir)) {
            logDebug('LocalEmbeddingsController', 'indexRetry', 'no repository to retry')
            return
        }
        const repoPath = this.lastRepo.dir
        logDebug('LocalEmbeddingsController', 'indexRetry', 'continuing to index repository', repoPath)
        await this.indexRequest({ repoPath: repoPath.fsPath, mode: { type: 'continue' } })
    }

    private async indexRequest(options: IndexRequest): Promise<void> {
        try {
            await (await this.getService()).request('embeddings/index', options)
            this.dirBeingIndexed = URI.file(options.repoPath)
            this.statusBar?.dispose()
            this.statusBar = vscode.window.createStatusBarItem(
                'cody-local-embeddings',
                vscode.StatusBarAlignment.Right,
                0
            )
        } catch (error: any) {
            logDebug('LocalEmbeddingsController', captureException(error), error)
        }
    }

    // Tries to load an index for the repo at the specified path, skipping any
    // cached results in `load`. This is used:
    // - When the service starts, to fulfill an earlier load request.
    // - When indexing finishes, to try to load the updated index.
    // - To implement the final step of `load`, if we did not hit any cached
    //   results.
    private async eagerlyLoad(repoDir: FileURI): Promise<boolean> {
        await wrapInActiveSpan('embeddings.load', async span => {
            try {
                const { repoName, indexSizeBytes } = await (await this.getService()).request(
                    'embeddings/load',
                    repoDir.fsPath
                )
                this.repoState.set(repoDir.toString(), {
                    repoName,
                    indexable: true,
                    errorReason: undefined,
                })
                this.lastRepo = {
                    dir: repoDir,
                    repoName,
                }
                span.setAttribute('repoLoaded', true)
                span.setAttribute('indexSize', indexSizeBytes)

                telemetryRecorder.recordEvent('cody.context.embeddings', 'loaded', {
                    metadata: {
                        indexSize: indexSizeBytes,
                    },
                })

                // Start a health check on the index.
                void this.healthCheck(repoName, repoDir)
            } catch (error: any) {
                logDebug(
                    'LocalEmbeddingsController',
                    'load',
                    captureException(error),
                    JSON.stringify(error)
                )

                const noRemoteErrorMessage =
                    "repository does not have a default fetch URL, so can't be named for an index"
                const noRemote = error.message === noRemoteErrorMessage

                const notAGitRepositoryErrorMessage = /does not appear to be a git repository/
                const notGit = notAGitRepositoryErrorMessage.test(error.message)

                let errorReason: GetFieldType<LocalEmbeddingsProvider, 'errorReason'>
                if (notGit) {
                    errorReason = 'not-a-git-repo'
                } else if (noRemote) {
                    errorReason = 'git-repo-has-no-remote'
                } else {
                    errorReason = undefined
                }
                if (errorReason) {
                    span.setAttribute('errorReason', errorReason)
                }
                this.repoState.set(repoDir.toString(), {
                    repoName: false,
                    indexable: !(notGit || noRemote),
                    errorReason,
                })

                // TODO: Log telemetry error messages to prioritize supporting
                // repos without remotes, other SCCS, etc.

                this.lastRepo = { dir: repoDir, repoName: false }
            }
        })
        return !!this.lastRepo?.repoName
    }

    private async healthCheck(repoName: string, repoDir: FileURI): Promise<void> {
        // Do a health check if we haven't done it in the last minute.
        if (this.lastHealth && this.lastHealthTime && Date.now() - this.lastHealthTime < 1000 * 60) {
            logDebug('LocalEmbeddingsController', 'healthCheck', 'skipping health check')
            return
        }

        await wrapInActiveSpan('embeddings.index-health', async span => {
            try {
                const health = await (await this.getService()).request('embeddings/index-health', {
                    repoName,
                })
                logDebug('LocalEmbeddingsController', 'index-health', JSON.stringify(health))
                span.setAttribute('repoHealthSucceeded', true)
                span.setAttribute('repoFound', health.type === 'found')
                if (health.type !== 'found') {
                    return
                }
                span.setAttribute('numItems', health.numItems)
                span.setAttribute('numFiles', health.numFiles)
                span.setAttribute('needsEmbedding', health.numItemsNeedEmbedding > 0)
                await this.onHealthReport(repoDir, health)
            } catch (error) {
                logDebug(
                    'LocalEmbeddingsController',
                    'index-health',
                    captureException(error),
                    JSON.stringify(error)
                )
                span.setAttribute('repoHealthSucceeded', false)
            }
        })
    }

    // After loading a repo, we asynchronously check whether the repository
    // still needs embeddings or if the embeddings are stale.
    private async onHealthReport(repoDir: FileURI, health: IndexHealthResultFound): Promise<void> {
        if (repoDir.toString() !== this.lastRepo?.dir.toString()) {
            // We've loaded a different repo since this health report; ignore it.
            return
        }
        this.lastHealth = health
        this.lastHealthTime = Date.now()
        const hasIssue = health.numItemsNeedEmbedding > 0
        if (hasIssue) {
            const canRetry = this.canAutoIndex() && !this.lastError
            let retrySucceeded = true
            if (canRetry) {
                try {
                    await this.indexRetry()
                } catch {
                    retrySucceeded = false
                }
            }
            if (!canRetry || !retrySucceeded) {
                await vscode.commands.executeCommand('setContext', 'cody.embeddings.hasIssue', hasIssue)
                this.updateIssueStatusBar()
            }
        }

        await this.checkIndexStaleness(repoDir, health)
    }

    // Check if the embeddings are stale and refresh the index if needed.
    private async checkIndexStaleness(repoDir: FileURI, health: IndexHealthResultFound): Promise<void> {
        const repo = vscodeGitAPI?.getRepository(repoDir)
        const currentCommit = repo?.state.HEAD?.commit ?? ''
        const changedFiles = (await repo?.diffBetween(health.commit, currentCommit))?.length ?? 0

        if (!isDefined(this.lastRepo) || changedFiles === 0) {
            logDebug('LocalEmbeddingsController', 'checkIndexStaleness: no change')
            return
        }

        // Compute the time since the last commit that was indexed.
        const currentCommitTime = (await repo?.getCommit(currentCommit))?.commitDate?.getTime()
        const lastIndexCommitTime = (await repo?.getCommit(health.commit))?.commitDate?.getTime()
        const timeSinceLastIndexedCommit =
            currentCommitTime && lastIndexCommitTime ? currentCommitTime - lastIndexCommitTime : 0

        const stalenessThresholds = [
            { changedFiles: 100, timeSince: 1000 * 60 * 60 }, // 1 hour
            { changedFiles: 10, timeSince: 1000 * 60 * 60 * 24 }, // 1 day
        ]

        // The embeddings are stale if the number of changed files and the time between the indexed commits surpass a threshold.
        const isStale = stalenessThresholds.some(threshold => {
            return (
                changedFiles >= threshold.changedFiles &&
                timeSinceLastIndexedCommit >= threshold.timeSince
            )
        })

        if (isStale) {
            logDebug(
                'LocalEmbeddingsController',
                'checkIndexStaleness: reindexing',
                'HEAD commit"',
                currentCommit,
                'last indexed commit:',
                health.commit,
                'seconds since last indexed commit:',
                timeSinceLastIndexedCommit / 1000,
                'number of changed files:',
                changedFiles
            )

            telemetryRecorder.recordEvent('cody.context.embeddings', 'reindexed', {
                metadata: {
                    timeSinceLastIndexedCommitSeconds: timeSinceLastIndexedCommit / 1000,
                    numChangedFiles: changedFiles,
                },
            })

            await this.indexRequest({
                repoPath: this.lastRepo.dir.fsPath,
                mode: {
                    type: 'new',
                    model: this.modelConfig.model,
                    dimension: this.modelConfig.dimension,
                },
            })
        }
    }

    private getNeedsEmbeddingText(options?: { prefix?: string; suffix?: string }): string {
        if (!this.lastHealth?.numItemsNeedEmbedding) {
            return ''
        }
        const percentDone = Math.floor(
            (100 * (this.lastHealth.numItems - this.lastHealth.numItemsNeedEmbedding)) /
                this.lastHealth.numItems
        )
        return `${options?.prefix || ''}Cody Embeddings index for ${
            this.lastRepo?.dir || 'this repository'
        } is only ${percentDone.toFixed(0)}% complete.${options?.suffix || ''}`
    }

    // Check if auto-indexing is enabled and if we're using the Sourcegraph provider.
    private canAutoIndex(): boolean {
        return this.modelConfig.provider === 'sourcegraph'
    }

    private updateIssueStatusBar(): void {
        this.statusBar?.dispose()
        this.statusBar = vscode.window.createStatusBarItem(
            'cody-local-embeddings',
            vscode.StatusBarAlignment.Right,
            0
        )
        this.statusBar.text = 'Embeddings Incomplete'
        const needsEmbeddingMessage = this.getNeedsEmbeddingText({
            prefix: '\n\n',
            suffix: ' Click to resolve.',
        })
        const errorMessage = this.lastError ? `\n\nError: ${this.lastError}` : ''
        this.statusBar.tooltip = new vscode.MarkdownString(
            `#### Cody Embeddings Incomplete\n\n${needsEmbeddingMessage}${errorMessage}`
        )
        this.statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
        this.statusBar.command = 'cody.embeddings.resolveIssue'
        this.statusBar.show()
    }

    // The user has clicked on the status bar to resolve an issue with embeddings.
    private resolveIssueCommand(): void {
        if (!(this.lastHealth || this.lastError)) {
            // There's nothing to do.
            return
        }
        if (this.lastHealth?.numItemsNeedEmbedding) {
            void (async () => {
                try {
                    const errorMessage = this.lastError ? `\n\nError: ${this.lastError}` : ''
                    const choice = await vscode.window.showWarningMessage(
                        this.getNeedsEmbeddingText() + errorMessage,
                        'Continue Indexing',
                        'Cancel'
                    )
                    switch (choice) {
                        case 'Cancel':
                            return
                        case 'Continue Indexing':
                            await this.indexRetry()
                    }
                } catch (error: any) {
                    logDebug(
                        'LocalEmbeddingsController',
                        'resolveIssueCommand',
                        captureException(error),
                        JSON.stringify(error)
                    )
                    await vscode.window.showErrorMessage(
                        `Cody Embeddings — Error resolving embeddings issue: ${error?.message}`
                    )
                }
            })()
        }
    }

    /** {@link LocalEmbeddingsFetcher.getContext} */
    public async getContext(query: PromptString, numResults: number): Promise<EmbeddingsSearchResult[]> {
        const { auth } = await firstValueFrom(this.config)
        const endpointIsDotCom = isDotCom(auth.serverEndpoint)
        if (!endpointIsDotCom) {
            return []
        }
        return wrapInActiveSpan('LocalEmbeddingsController.query', async span => {
            try {
                span.setAttribute('provider', this.modelConfig.provider)
                const lastRepo = this.lastRepo
                if (!lastRepo?.repoName) {
                    span.setAttribute('noResultReason', 'last-repo-not-set')
                    return []
                }
                const service = await this.getService()
                const resp = await service.request('embeddings/query', {
                    repoName: lastRepo.repoName,
                    query: query.toString(),
                    numResults,
                })
                logDebug(
                    'LocalEmbeddingsController',
                    'query',
                    `returning ${resp.results.length} results`
                )
                void this.healthCheck(lastRepo.repoName, lastRepo.dir)
                return resp.results.map(result => ({
                    ...result,
                    uri: vscode.Uri.joinPath(lastRepo.dir, result.fileName),
                }))
            } catch (error) {
                logDebug('LocalEmbeddingsController', 'query', captureException(error), error)
                recordErrorToSpan(span, error as Error)
                return []
            }
        })
    }
}
