import { spawnSync } from 'child_process'

import * as vscode from 'vscode'

import { ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
import { CodebaseContext } from '@sourcegraph/cody-shared/src/codebase-context'
import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { Editor } from '@sourcegraph/cody-shared/src/editor'
import { SourcegraphEmbeddingsSearchClient } from '@sourcegraph/cody-shared/src/embeddings/client'
import { SourcegraphGraphQLAPIClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql'
import { isError } from '@sourcegraph/cody-shared/src/utils'

import { getFullConfig } from '../configuration'
import { VSCodeEditor } from '../editor/vscode-editor'
import { FilenameContextFetcher } from '../local-context/filename-context-fetcher'
import { LocalKeywordContextFetcher } from '../local-context/local-keyword-context-fetcher'
import { debug } from '../log'
import { getRerankWithLog } from '../logged-rerank'
import { AuthProvider } from '../services/AuthProvider'
import { logEvent } from '../services/EventLogger'
import { LocalStorage } from '../services/LocalStorageProvider'
import { SecretStorage } from '../services/SecretStorageProvider'

import { ChatViewProviderWebview } from './ChatViewProvider'
import { ConfigurationSubsetForWebview, DOTCOM_URL, isLocalApp, LocalEnv } from './protocol'
import { convertGitCloneURLToCodebaseName } from './utils'

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
    | 'experimentalChatPredictions'
    | 'experimentalGuardrails'
    | 'experimentalCustomRecipes'
    | 'pluginsEnabled'
    | 'pluginsConfig'
    | 'pluginsDebugEnabled'
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
        private secretStorage: SecretStorage,
        private localStorage: LocalStorage,
        private rgPath: string,
        private authProvider: AuthProvider
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
            vscode.commands.registerCommand('cody.auth.sync', () => this.syncAuthStatus())
        )
    }

    public get context(): CodebaseContext {
        return this.codebaseContext
    }

    public async init(): Promise<void> {
        await this.publishContextStatus()
    }

    public onConfigurationChange(newConfig: Config): void {
        debug('ContextProvider:onConfigurationChange', '')
        this.config = newConfig
        const authStatus = this.authProvider.getAuthStatus()
        if (authStatus.endpoint) {
            this.config.serverEndpoint = authStatus.endpoint
        }
        this.configurationChangeEvent.fire()
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

        const codebaseContext = await getCodebaseContext(this.config, this.rgPath, this.editor, this.chat)
        if (!codebaseContext) {
            return
        }
        // after await, check we're still hitting the same workspace root
        if (this.currentWorkspaceRoot !== workspaceRoot) {
            return
        }

        this.codebaseContext = codebaseContext
        await this.publishContextStatus()
        this.editor.controllers.prompt.setCodebase(codebaseContext.getCodebase())
    }

    /**
     * Save, verify, and sync authStatus between extension host and webview
     * activate extension when user has valid login
     */
    public async syncAuthStatus(): Promise<void> {
        const authStatus = this.authProvider.getAuthStatus()
        // Update config to the latest one and fire configure change event to update external services
        const newConfig = await getFullConfig(this.secretStorage, this.localStorage)
        if (authStatus.siteVersion) {
            // Update codebase context
            const codebaseContext = await getCodebaseContext(newConfig, this.rgPath, this.editor, this.chat)
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
                    selection: editorContext ? editorContext.selection : undefined,
                    supportsKeyword: true,
                },
            })
        }
        this.disposables.push(this.configurationChangeEvent.event(() => send()))
        this.disposables.push(vscode.window.onDidChangeTextEditorSelection(() => send()))
        return send()
    }

    /**
     * Publish the config to the webview.
     */
    private async publishConfig(): Promise<void> {
        const send = async (): Promise<void> => {
            this.config = await getFullConfig(this.secretStorage, this.localStorage)

            // check if the new configuration change is valid or not
            const authStatus = this.authProvider.getAuthStatus()
            const localProcess = await this.authProvider.appDetector.getProcessInfo(authStatus.isLoggedIn)
            const configForWebview: ConfigurationSubsetForWebview & LocalEnv = {
                ...localProcess,
                debugEnable: this.config.debugEnable,
                serverEndpoint: this.config.serverEndpoint,
                pluginsEnabled: this.config.pluginsEnabled,
                pluginsDebugEnabled: this.config.pluginsDebugEnabled,
            }

            // update codebase context on configuration change
            await this.updateCodebaseContext()
            await this.webview?.postMessage({ type: 'config', config: configForWebview, authStatus })
            debug('Cody:publishConfig', 'configForWebview', { verbose: configForWebview })
        }

        await send()
    }

    /**
     * Log Events - naming convention: source:feature:action
     */
    public sendEvent(event: ContextEvent, value: string): void {
        const endpoint = this.config.serverEndpoint || DOTCOM_URL.href
        const endpointUri = { serverEndpoint: endpoint }
        switch (event) {
            case 'auth':
                logEvent(`CodyVSCodeExtension:Auth:${value}`, endpointUri, endpointUri)
                break
        }
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
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
export async function getCodebaseContext(
    config: Config,
    rgPath: string,
    editor: Editor,
    chatClient: ChatClient
): Promise<CodebaseContext | null> {
    const client = new SourcegraphGraphQLAPIClient(config)
    const workspaceRoot = editor.getWorkspaceRootPath()
    if (!workspaceRoot) {
        return null
    }
    const gitCommand = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: workspaceRoot })
    const gitOutput = gitCommand.stdout.toString().trim()
    // Get codebase from config or fallback to getting repository name from git clone URL
    const codebase = config.codebase || convertGitCloneURLToCodebaseName(gitOutput)
    if (!codebase) {
        return null
    }
    // Check if repo is embedded in endpoint
    const repoId = await client.getRepoIdIfEmbeddingExists(codebase)
    if (isError(repoId)) {
        const infoMessage = `Cody could not find embeddings for '${codebase}' on your Sourcegraph instance.\n`
        console.info(infoMessage)
        return null
    }

    const embeddingsSearch = repoId && !isError(repoId) ? new SourcegraphEmbeddingsSearchClient(client, repoId) : null
    return new CodebaseContext(
        config,
        codebase,
        embeddingsSearch,
        new LocalKeywordContextFetcher(rgPath, editor, chatClient),
        new FilenameContextFetcher(rgPath, editor, chatClient),
        undefined,
        getRerankWithLog(chatClient)
    )
}
