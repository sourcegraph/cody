import { throttle } from 'lodash'
import * as vscode from 'vscode'

import { ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
import { CodebaseContext } from '@sourcegraph/cody-shared/src/codebase-context'
import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { Editor } from '@sourcegraph/cody-shared/src/editor'
import { EmbeddingsDetector } from '@sourcegraph/cody-shared/src/embeddings/EmbeddingsDetector'
import { IndexedKeywordContextFetcher } from '@sourcegraph/cody-shared/src/local-context'
import { isLocalApp, LOCAL_APP_URL } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'
import { SourcegraphGraphQLAPIClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql'
import { GraphQLAPIClientConfig } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'
import { convertGitCloneURLToCodebaseName, isError } from '@sourcegraph/cody-shared/src/utils'

import { getFullConfig } from '../configuration'
import { VSCodeEditor } from '../editor/vscode-editor'
import { PlatformContext } from '../extension.common'
import { logDebug } from '../log'
import { getRerankWithLog } from '../logged-rerank'
import { repositoryRemoteUrl } from '../repository/repositoryHelpers'
import { AuthProvider } from '../services/AuthProvider'
import * as OnboardingExperiment from '../services/OnboardingExperiment'
import { secretStorage } from '../services/SecretStorageProvider'
import { telemetryService } from '../services/telemetry'

import { ChatViewProviderWebview } from './ChatViewProvider'
import { GraphContextProvider } from './GraphContextProvider'
import { ConfigurationSubsetForWebview, LocalEnv } from './protocol'

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
    | 'experimentalCommandLenses'
    | 'experimentalEditorTitleCommandIcon'
    | 'experimentalLocalSymbols'
    | 'inlineChat'
>

export enum ContextEvent {
    Auth = 'auth',
}

export class ContextProvider implements vscode.Disposable {
    // We fire messages from ContextProvider to the sidebar webview.
    // TODO(umpox): Should we add support for showing context in other places (i.e. within inline chat)?
    public webview?: ChatViewProviderWebview

    // Fire event to let subscribers know that the configuration has changed
    public configurationChangeEvent = new vscode.EventEmitter<void>()

    // Codebase-context-related state
    public currentWorkspaceRoot: string

    protected disposables: vscode.Disposable[] = []

    constructor(
        public config: Omit<Config, 'codebase'>, // should use codebaseContext.getCodebase() rather than config.codebase
        private chat: ChatClient,
        private codebaseContext: CodebaseContext,
        private editor: VSCodeEditor,
        private rgPath: string | null,
        private symf: IndexedKeywordContextFetcher | undefined,
        private authProvider: AuthProvider,
        private platform: PlatformContext
    ) {
        this.disposables.push(this.configurationChangeEvent)

        this.currentWorkspaceRoot = ''
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(async () => {
                await this.updateCodebaseContext()
            }),
            vscode.workspace.onDidChangeWorkspaceFolders(async () => {
                await this.updateCodebaseContext()
            })
        )
    }

    public get context(): CodebaseContext {
        return this.codebaseContext
    }

    public async init(): Promise<void> {
        await this.updateCodebaseContext()
        await this.publishContextStatus()
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
        const workspaceRoot = this.editor.getWorkspaceRootPath()
        if (!workspaceRoot || workspaceRoot === '' || workspaceRoot === this.currentWorkspaceRoot) {
            return
        }
        this.currentWorkspaceRoot = workspaceRoot

        const codebaseContext = await getCodebaseContext(
            this.config,
            this.rgPath,
            this.symf,
            this.editor,
            this.chat,
            this.platform,
            await this.getEmbeddingClientCandidates(this.config)
        )
        if (!codebaseContext) {
            return
        }
        // after await, check we're still hitting the same workspace root
        if (this.currentWorkspaceRoot !== workspaceRoot) {
            return
        }

        this.codebaseContext = codebaseContext
        await this.publishContextStatus()
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
                this.rgPath,
                this.symf,
                this.editor,
                this.chat,
                this.platform,
                await this.getEmbeddingClientCandidates(newConfig)
            )
            if (codebaseContext) {
                this.codebaseContext = codebaseContext
            }
        }
        await this.publishConfig()
        this.onConfigurationChange(newConfig)
        // When logged out, user's endpoint will be set to null
        const isLoggedOut = !authStatus.isLoggedIn && !authStatus.endpoint
        const isAppEvent = isLocalApp(authStatus.endpoint || '') ? 'app:' : ''
        const eventValue = isLoggedOut ? 'disconnected' : authStatus.isLoggedIn ? 'connected' : 'failed'
        // e.g. auth:app:connected, auth:app:disconnected, auth:failed
        this.sendEvent(ContextEvent.Auth, isAppEvent + eventValue)
    }

    /**
     * Publish the current context status to the webview.
     */
    private async publishContextStatus(): Promise<void> {
        const send = async (): Promise<void> => {
            const editorContext = this.editor.getActiveTextEditor()
            await this.webview?.postMessage({
                type: 'contextStatus',
                contextStatus: {
                    mode: this.config.useContext,
                    connection: this.codebaseContext.checkEmbeddingsConnection(),
                    codebase: this.codebaseContext.getCodebase(),
                    filePath: editorContext ? vscode.workspace.asRelativePath(editorContext.filePath) : undefined,
                    selectionRange: editorContext ? editorContext.selectionRange : undefined,
                    supportsKeyword: true,
                },
            })
        }
        const throttledSend = throttle(send, 250, { leading: true, trailing: true })

        this.disposables.push(this.configurationChangeEvent.event(() => throttledSend()))
        this.disposables.push(vscode.window.onDidChangeActiveTextEditor(() => throttledSend()))
        this.disposables.push(vscode.window.onDidChangeTextEditorSelection(() => throttledSend()))
        return throttledSend()
    }

    /**
     * Publish the config to the webview.
     */
    private async publishConfig(): Promise<void> {
        const send = async (): Promise<void> => {
            this.config = await getFullConfig()

            // check if the new configuration change is valid or not
            const authStatus = this.authProvider.getAuthStatus()
            const localProcess = await this.authProvider.appDetector.getProcessInfo(authStatus.isLoggedIn)
            const configForWebview: ConfigurationSubsetForWebview & LocalEnv = {
                ...localProcess,
                debugEnable: this.config.debugEnable,
                serverEndpoint: this.config.serverEndpoint,
                experimentOnboarding: OnboardingExperiment.pickArm(telemetryService),
            }

            // update codebase context on configuration change
            await this.updateCodebaseContext()
            await this.webview?.postMessage({ type: 'config', config: configForWebview, authStatus })
            logDebug('Cody:publishConfig', 'configForWebview', { verbose: configForWebview })
        }

        await send()
    }

    /**
     * Log Events - naming convention: source:feature:action
     */
    private sendEvent(event: ContextEvent, value: string): void {
        switch (event) {
            case 'auth':
                telemetryService.log(`CodyVSCodeExtension:Auth:${value}`)
                break
        }
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }

    // If set, a client to talk to app directly.
    private appClient?: SourcegraphGraphQLAPIClient

    // Tries to get a GraphQL client config to talk to app. If there's no app
    // token, we can't do that; in that case, returns `undefined`. Caches the
    // client.
    private async maybeAppClient(): Promise<SourcegraphGraphQLAPIClient | undefined> {
        if (this.appClient) {
            return this.appClient
        }

        // App access tokens are written to secret storage by LocalAppDetector.
        // Retrieve this token here.
        const accessToken = await secretStorage.get(LOCAL_APP_URL.href)
        if (!accessToken) {
            return undefined
        }
        const clientConfig = {
            serverEndpoint: LOCAL_APP_URL.href,
            accessToken,
            customHeaders: {},
        }
        return (this.appClient = new SourcegraphGraphQLAPIClient(clientConfig))
    }

    // Gets a list of GraphQL clients to interrogate for embeddings
    // availability.
    private async getEmbeddingClientCandidates(config: GraphQLAPIClientConfig): Promise<SourcegraphGraphQLAPIClient[]> {
        const result = [new SourcegraphGraphQLAPIClient(config)]
        if (isLocalApp(config.serverEndpoint)) {
            // We will just talk to app.
            return result
        }
        // The other client is talking to non-app (dotcom, etc.) so create a
        // client to talk to app.
        const appClient = await this.maybeAppClient()
        if (appClient) {
            // By putting the app client first, we prefer to talk to app if
            // both app and server have embeddings.
            result.unshift(appClient)
        }
        return result
    }
}

/**
 * Gets codebase context for the current workspace.
 *
 * @param config Cody configuration
 * @param rgPath Path to rg (ripgrep) executable
 * @param editor Editor instance
 * @returns CodebaseContext if a codebase can be determined, else null
 */
async function getCodebaseContext(
    config: Config,
    rgPath: string | null,
    symf: IndexedKeywordContextFetcher | undefined,
    editor: Editor,
    chatClient: ChatClient,
    platform: PlatformContext,
    embeddingsClientCandidates: readonly SourcegraphGraphQLAPIClient[]
): Promise<CodebaseContext | null> {
    const workspaceRoot = editor.getWorkspaceRootUri()
    if (!workspaceRoot) {
        return null
    }
    const remoteUrl = repositoryRemoteUrl(workspaceRoot)
    // Get codebase from config or fallback to getting repository name from git clone URL
    const codebase = config.codebase || (remoteUrl ? convertGitCloneURLToCodebaseName(remoteUrl) : null)
    if (!codebase) {
        return null
    }

    // Find an embeddings client
    let embeddingsSearch = await EmbeddingsDetector.newEmbeddingsSearchClient(embeddingsClientCandidates, codebase)
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
        embeddingsSearch || null,
        rgPath ? platform.createLocalKeywordContextFetcher?.(rgPath, editor, chatClient) ?? null : null,
        rgPath ? platform.createFilenameContextFetcher?.(rgPath, editor, chatClient) ?? null : null,
        new GraphContextProvider(editor),
        symf,
        undefined,
        getRerankWithLog(chatClient)
    )
}
