import * as vscode from 'vscode'

import { type ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
import { CodebaseContext } from '@sourcegraph/cody-shared/src/codebase-context'
import {
    type ContextGroup,
    type ContextStatusProvider,
} from '@sourcegraph/cody-shared/src/codebase-context/context-status'
import { type ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { type Editor } from '@sourcegraph/cody-shared/src/editor'
import { EmbeddingsDetector } from '@sourcegraph/cody-shared/src/embeddings/EmbeddingsDetector'
import { type IndexedKeywordContextFetcher } from '@sourcegraph/cody-shared/src/local-context'
import { SourcegraphGraphQLAPIClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql'
import { type GraphQLAPIClientConfig } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'
import { isError } from '@sourcegraph/cody-shared/src/utils'

import { getFullConfig } from '../configuration'
import { getEditor } from '../editor/active-editor'
import { type VSCodeEditor } from '../editor/vscode-editor'
import { type PlatformContext } from '../extension.common'
import { ContextStatusAggregator } from '../local-context/enhanced-context-status'
import { type LocalEmbeddingsController } from '../local-context/local-embeddings'
import { logDebug } from '../log'
import { getCodebaseFromWorkspaceUri, gitDirectoryUri } from '../repository/repositoryHelpers'
import { type AuthProvider } from '../services/AuthProvider'
import { getProcessInfo } from '../services/LocalAppDetector'
import { logPrefix, telemetryService } from '../services/telemetry'
import { telemetryRecorder } from '../services/telemetry-v2'

import { type SidebarChatWebview } from './chat-view/SidebarViewController'
import { GraphContextProvider } from './GraphContextProvider'
import { type AuthStatus, type ConfigurationSubsetForWebview, type LocalEnv } from './protocol'

export type Config = Pick<
    ConfigurationWithAccessToken,
    | 'codebase'
    | 'serverEndpoint'
    | 'debugEnable'
    | 'debugFilter'
    | 'debugVerbose'
    | 'customHeaders'
    | 'accessToken'
    | 'useContext'
    | 'codeActions'
    | 'experimentalChatPredictions'
    | 'experimentalGuardrails'
    | 'commandCodeLenses'
    | 'experimentalSimpleChatContext'
    | 'experimentalSymfContext'
    | 'editorTitleCommandIcon'
    | 'experimentalLocalSymbols'
    | 'internalUnstable'
>

enum ContextEvent {
    Auth = 'auth',
}

export class ContextProvider implements vscode.Disposable, ContextStatusProvider {
    // We fire messages from ContextProvider to the sidebar webview.
    // TODO(umpox): Should we add support for showing context in other places (i.e. within inline chat)?
    public webview?: SidebarChatWebview

    // Fire event to let subscribers know that the configuration has changed
    public configurationChangeEvent = new vscode.EventEmitter<void>()

    // Codebase-context-related state
    public currentWorkspaceRoot: string

    protected disposables: vscode.Disposable[] = []

    private statusAggregator: ContextStatusAggregator = new ContextStatusAggregator()
    private statusEmbeddings: vscode.Disposable | undefined = undefined

    constructor(
        public config: Omit<Config, 'codebase'>, // should use codebaseContext.getCodebase() rather than config.codebase
        private chat: ChatClient,
        private codebaseContext: CodebaseContext,
        private editor: VSCodeEditor,
        private rgPath: string | null,
        private symf: IndexedKeywordContextFetcher | undefined,
        private authProvider: AuthProvider,
        private platform: PlatformContext,
        public readonly localEmbeddings: LocalEmbeddingsController | undefined
    ) {
        this.disposables.push(this.configurationChangeEvent)

        this.currentWorkspaceRoot = ''
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(async () => {
                await this.updateCodebaseContext()
            }),
            vscode.workspace.onDidChangeWorkspaceFolders(async () => {
                await this.updateCodebaseContext()
            }),
            this.statusAggregator,
            this.statusAggregator.onDidChangeStatus(() => {
                this.contextStatusChangeEmitter.fire(this)
            }),
            this.contextStatusChangeEmitter
        )

        if (this.localEmbeddings) {
            this.disposables.push(
                this.localEmbeddings.onChange(() => {
                    void this.forceUpdateCodebaseContext()
                })
            )
        }
    }

    public get context(): CodebaseContext {
        return this.codebaseContext
    }

    // Initializes context provider state. This blocks extension activation and
    // chat startup. Despite being called 'init', this is called multiple times:
    // - Once on extension activation.
    // - With every MessageProvider, including ChatPanelProvider.
    public async init(): Promise<void> {
        await this.updateCodebaseContext()
    }

    public onConfigurationChange(newConfig: Config): void {
        logDebug('ContextProvider:onConfigurationChange', 'using codebase', newConfig.codebase)
        this.config = newConfig
        const authStatus = this.authProvider.getAuthStatus()
        if (authStatus.endpoint) {
            this.config.serverEndpoint = authStatus.endpoint
        }
        this.configurationChangeEvent.fire()
    }

    public async forceUpdateCodebaseContext(): Promise<void> {
        this.currentWorkspaceRoot = ''
        return this.syncAuthStatus()
    }

    private async updateCodebaseContext(): Promise<void> {
        if (!this.editor.getActiveTextEditor() && vscode.window.visibleTextEditors.length !== 0) {
            // these are ephemeral
            return
        }
        const workspaceRoot = this.editor.getWorkspaceRootUri()?.fsPath
        if (!workspaceRoot || workspaceRoot === '' || workspaceRoot === this.currentWorkspaceRoot) {
            return
        }
        this.currentWorkspaceRoot = workspaceRoot

        const codebaseContext = await getCodebaseContext(
            this.config,
            this.authProvider.getAuthStatus(),
            this.rgPath,
            this.symf,
            this.editor,
            this.chat,
            this.platform,
            await this.getEmbeddingClientCandidates(this.config),
            this.localEmbeddings
        )
        if (!codebaseContext) {
            return
        }
        // after await, check we're still hitting the same workspace root
        if (this.currentWorkspaceRoot !== workspaceRoot) {
            return
        }

        this.codebaseContext = codebaseContext

        this.statusEmbeddings?.dispose()
        if (this.localEmbeddings && !this.codebaseContext.embeddings) {
            // Add status from local embeddings when:
            // - CodebaseContext has *no* embeddings. This lets us display the
            //   promotion to set up local embeddings.
            // - CodebaseContext has local embeddings (in this case,
            //   this.codebaseContext.embeddings will be null.)
            this.statusEmbeddings = this.statusAggregator.addProvider(this.localEmbeddings)
        } else if (this.codebaseContext.embeddings) {
            this.statusEmbeddings = this.statusAggregator.addProvider(this.codebaseContext.embeddings)
        }
    }

    /**
     * Save, verify, and sync authStatus between extension host and webview
     * activate extension when user has valid login
     */
    public async syncAuthStatus(): Promise<void> {
        const authStatus = this.authProvider.getAuthStatus()
        // Update config to the latest one and fire configure change event to update external services
        const newConfig = await getFullConfig()
        if (authStatus.siteVersion) {
            // Update codebase context
            const codebaseContext = await getCodebaseContext(
                newConfig,
                this.authProvider.getAuthStatus(),
                this.rgPath,
                this.symf,
                this.editor,
                this.chat,
                this.platform,
                await this.getEmbeddingClientCandidates(newConfig),
                this.localEmbeddings
            )
            if (codebaseContext) {
                this.codebaseContext = codebaseContext
            }
        }
        await this.publishConfig()
        this.onConfigurationChange(newConfig)
        // When logged out, user's endpoint will be set to null
        const isLoggedOut = !authStatus.isLoggedIn && !authStatus.endpoint
        const eventValue = isLoggedOut ? 'disconnected' : authStatus.isLoggedIn ? 'connected' : 'failed'
        switch (ContextEvent.Auth) {
            case 'auth':
                telemetryService.log(`${logPrefix(newConfig.agentIDE)}:Auth:${eventValue}`, undefined, { agent: true })
                telemetryRecorder.recordEvent('cody.auth', eventValue)
                break
        }
    }

    /**
     * Publish the config to the webview.
     */
    private async publishConfig(): Promise<void> {
        const send = async (): Promise<void> => {
            this.config = await getFullConfig()

            // check if the new configuration change is valid or not
            const authStatus = this.authProvider.getAuthStatus()
            const localProcess = getProcessInfo()
            const configForWebview: ConfigurationSubsetForWebview & LocalEnv = {
                ...localProcess,
                debugEnable: this.config.debugEnable,
                serverEndpoint: this.config.serverEndpoint,
                experimentalGuardrails: this.config.experimentalGuardrails,
            }
            const workspaceFolderUris = vscode.workspace.workspaceFolders?.map(folder => folder.uri.toString()) ?? []

            // update codebase context on configuration change
            await this.updateCodebaseContext()
            await this.webview?.postMessage({
                type: 'config',
                config: configForWebview,
                authStatus,
                workspaceFolderUris,
            })

            logDebug('Cody:publishConfig', 'configForWebview', { verbose: configForWebview })
        }

        await send()
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }

    // Gets a list of GraphQL clients to interrogate for embeddings
    // availability.
    private getEmbeddingClientCandidates(config: GraphQLAPIClientConfig): Promise<SourcegraphGraphQLAPIClient[]> {
        return Promise.resolve([new SourcegraphGraphQLAPIClient(config)])
    }

    // ContextStatusProvider implementation
    private contextStatusChangeEmitter = new vscode.EventEmitter<ContextStatusProvider>()

    public get status(): ContextGroup[] {
        return this.statusAggregator.status
    }

    public onDidChangeStatus(callback: (provider: ContextStatusProvider) => void): vscode.Disposable {
        return this.contextStatusChangeEmitter.event(callback)
    }
}

/**
 * Gets codebase context for the current workspace.
 * @returns CodebaseContext if a codebase can be determined, else null
 */
async function getCodebaseContext(
    config: Config,
    authStatus: AuthStatus,
    rgPath: string | null,
    symf: IndexedKeywordContextFetcher | undefined,
    editor: Editor,
    chatClient: ChatClient,
    platform: PlatformContext,
    embeddingsClientCandidates: readonly SourcegraphGraphQLAPIClient[],
    localEmbeddings: LocalEmbeddingsController | undefined
): Promise<CodebaseContext | null> {
    const workspaceRoot = editor.getWorkspaceRootUri()
    if (!workspaceRoot) {
        return null
    }
    const currentFile = getEditor()?.active?.document?.uri
    // Get codebase from config or fallback to getting codebase name from current file URL
    // Always use the codebase from config as this is manually set by the user
    const codebase = config.codebase || (currentFile ? getCodebaseFromWorkspaceUri(currentFile) : config.codebase)
    if (!codebase) {
        return null
    }

    // TODO: When we remove this class (ContextProvider), SimpleChatContextProvider
    // should be updated to invoke localEmbeddings.load when the codebase changes
    const repoDirUri = gitDirectoryUri(workspaceRoot)
    const hasLocalEmbeddings = repoDirUri ? localEmbeddings?.load(repoDirUri) : false
    let embeddingsSearch = await EmbeddingsDetector.newEmbeddingsSearchClient(
        embeddingsClientCandidates,
        codebase,
        workspaceRoot.fsPath
    )
    if (isError(embeddingsSearch)) {
        logDebug(
            'ContextProvider:getCodebaseContext',
            `Cody could not find embeddings for '${codebase}' on your Sourcegraph instance`
        )
        embeddingsSearch = undefined
    }

    return new CodebaseContext(
        config,
        codebase,
        () => authStatus.endpoint ?? '',
        // Use embeddings search if there are no local embeddings.
        (!(await hasLocalEmbeddings) && embeddingsSearch) || null,
        rgPath ? platform.createFilenameContextFetcher?.(rgPath, editor, chatClient) ?? null : null,
        new GraphContextProvider(editor),
        // Use local embeddings if we have them.
        ((await hasLocalEmbeddings) && localEmbeddings) || null,
        symf,
        undefined
    )
}
