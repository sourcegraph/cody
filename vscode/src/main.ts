import * as vscode from 'vscode'

import { type ChatEventSource } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { type ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { FeatureFlag, featureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'
import { newPromptMixin, PromptMixin } from '@sourcegraph/cody-shared/src/prompt/prompt-mixin'
import { isDotCom } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'
import { graphqlClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql'

import { CachedRemoteEmbeddingsClient } from './chat/CachedRemoteEmbeddingsClient'
import { ChatManager, CodyChatPanelViewType } from './chat/chat-view/ChatManager'
import { ContextProvider } from './chat/ContextProvider'
import { type MessageProviderOptions } from './chat/MessageProvider'
import {
    ACCOUNT_LIMITS_INFO_URL,
    ACCOUNT_UPGRADE_URL,
    ACCOUNT_USAGE_URL,
    CODY_FEEDBACK_URL,
    type AuthStatus,
} from './chat/protocol'
import { CodeActionProvider } from './code-actions/CodeActionProvider'
import { createInlineCompletionItemProvider } from './completions/create-inline-completion-item-provider'
import { getConfiguration, getFullConfig } from './configuration'
import { EditManager } from './edit/manager'
import { manageDisplayPathEnvInfoForExtension } from './editor/displayPathEnvInfo'
import { VSCodeEditor } from './editor/vscode-editor'
import { type PlatformContext } from './extension.common'
import { configureExternalServices } from './external-services'
import { logDebug } from './log'
import { showSetupNotification } from './notifications/setup-notification'
import { gitAPIinit } from './repository/repositoryHelpers'
import { SearchViewProvider } from './search/SearchViewProvider'
import { AuthProvider } from './services/AuthProvider'
import { showFeedbackSupportQuickPick } from './services/FeedbackOptions'
import { GuardrailsProvider } from './services/GuardrailsProvider'
import { localStorage } from './services/LocalStorageProvider'
import { getAccessToken, secretStorage, VSCodeSecretStorage } from './services/SecretStorageProvider'
import { createStatusBar } from './services/StatusBar'
import { createOrUpdateEventLogger, telemetryService } from './services/telemetry'
import { createOrUpdateTelemetryRecorderProvider, telemetryRecorder } from './services/telemetry-v2'
import { onTextDocumentChange } from './services/utils/codeblock-action-tracker'
import { parseAllVisibleDocuments, updateParseTreeOnEdit } from './tree-sitter/parse-tree-cache'

/**
 * Start the extension, watching all relevant configuration and secrets for changes.
 */
export async function start(context: vscode.ExtensionContext, platform: PlatformContext): Promise<vscode.Disposable> {
    // Set internal storage fields for storage provider singletons
    localStorage.setStorage(context.globalState)
    if (secretStorage instanceof VSCodeSecretStorage) {
        secretStorage.setStorage(context.secrets)
    }

    const rgPath = platform.getRgPath ? await platform.getRgPath() : null

    const disposables: vscode.Disposable[] = []

    const { disposable, onConfigurationChange } = await register(context, await getFullConfig(), rgPath, platform)
    disposables.push(disposable)

    // Re-initialize when configuration
    disposables.push(
        vscode.workspace.onDidChangeConfiguration(async event => {
            if (event.affectsConfiguration('cody')) {
                const config = await getFullConfig()
                onConfigurationChange(config)
                platform.onConfigurationChange?.(config)
                if (config.chatPreInstruction) {
                    PromptMixin.addCustom(newPromptMixin(config.chatPreInstruction))
                }
            }
        })
    )

    return vscode.Disposable.from(...disposables)
}

// Registers commands and webview given the config.
const register = async (
    context: vscode.ExtensionContext,
    initialConfig: ConfigurationWithAccessToken,
    rgPath: string | null,
    platform: Omit<PlatformContext, 'getRgPath'>
): Promise<{
    disposable: vscode.Disposable
    onConfigurationChange: (newConfig: ConfigurationWithAccessToken) => void
}> => {
    const disposables: vscode.Disposable[] = []

    // Initialize `displayPath` first because it might be used to display paths in error messages
    // from the subsequent initialization.
    disposables.push(manageDisplayPathEnvInfoForExtension())

    // Set codyignore list on git extension startup
    const gitAPI = await gitAPIinit()
    if (gitAPI) {
        disposables.push(gitAPI)
    }

    const isExtensionModeDevOrTest =
        context.extensionMode === vscode.ExtensionMode.Development ||
        context.extensionMode === vscode.ExtensionMode.Test
    await configureEventsInfra(initialConfig, isExtensionModeDevOrTest)

    const commandsController = platform.createCommandsController?.()
    const editor = new VSCodeEditor({ command: commandsController })

    // Could we use the `initialConfig` instead?
    const workspaceConfig = vscode.workspace.getConfiguration()
    const config = getConfiguration(workspaceConfig)

    if (config.chatPreInstruction) {
        PromptMixin.addCustom(newPromptMixin(config.chatPreInstruction))
    }

    parseAllVisibleDocuments()

    disposables.push(vscode.window.onDidChangeVisibleTextEditors(parseAllVisibleDocuments))
    disposables.push(vscode.workspace.onDidChangeTextDocument(updateParseTreeOnEdit))

    // Enable tracking for pasting chat responses into editor text
    disposables.push(
        vscode.workspace.onDidChangeTextDocument(async e => {
            const changedText = e.contentChanges[0]?.text
            // Skip if the document is not a file or if the copied text is from insert
            if (!changedText || e.document.uri.scheme !== 'file') {
                return
            }
            await onTextDocumentChange(changedText)
        })
    )

    const authProvider = new AuthProvider(initialConfig)
    await authProvider.init()

    graphqlClient.onConfigurationChange(initialConfig)
    void featureFlagProvider.syncAuthStatus()

    const {
        intentDetector,
        codebaseContext: initialCodebaseContext,
        chatClient,
        codeCompletionsClient,
        guardrails,
        localEmbeddings,
        onConfigurationChange: externalServicesOnDidConfigurationChange,
        symfRunner,
    } = await configureExternalServices(context, initialConfig, rgPath, editor, platform)

    if (symfRunner) {
        disposables.push(symfRunner)
    }

    const contextProvider = new ContextProvider(
        initialConfig,
        chatClient,
        initialCodebaseContext,
        editor,
        rgPath,
        symfRunner,
        authProvider,
        platform,
        localEmbeddings
    )
    disposables.push(contextProvider)
    await contextProvider.init()

    // Shared configuration that is required for chat views to send and receive messages
    const messageProviderOptions: MessageProviderOptions = {
        chat: chatClient,
        intentDetector,
        guardrails,
        editor,
        authProvider,
        contextProvider,
        platform,
    }

    // Evaluate a mock feature flag for the purpose of an A/A test. No functionality is affected by this flag.
    await featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyChatMockTest)

    const embeddingsClient = new CachedRemoteEmbeddingsClient(initialConfig)
    const chatManager = new ChatManager(
        {
            ...messageProviderOptions,
            extensionUri: context.extensionUri,
        },
        chatClient,
        embeddingsClient,
        localEmbeddings || null,
        symfRunner || null
    )

    disposables.push(new EditManager({ chat: chatClient, editor, contextProvider }))
    disposables.push(new CodeActionProvider({ contextProvider }))

    let oldConfig = JSON.stringify(initialConfig)
    function onConfigurationChange(newConfig: ConfigurationWithAccessToken): void {
        if (oldConfig === JSON.stringify(newConfig)) {
            return
        }
        oldConfig = JSON.stringify(newConfig)

        featureFlagProvider.syncAuthStatus()
        graphqlClient.onConfigurationChange(newConfig)
        contextProvider.onConfigurationChange(newConfig)
        externalServicesOnDidConfigurationChange(newConfig)
        void configureEventsInfra(newConfig, isExtensionModeDevOrTest)
        platform.onConfigurationChange?.(newConfig)
        symfRunner?.setSourcegraphAuth(newConfig.serverEndpoint, newConfig.accessToken)
        void localEmbeddings?.setAccessToken(newConfig.serverEndpoint, newConfig.accessToken)
        embeddingsClient.updateConfiguration(newConfig)
        setupAutocomplete()
    }

    // Register tree views
    disposables.push(
        chatManager,
        vscode.window.registerWebviewViewProvider('cody.chat', chatManager.sidebarViewController, {
            webviewOptions: { retainContextWhenHidden: true },
        }),
        // Update external services when configurationChangeEvent is fired by chatProvider
        contextProvider.configurationChangeEvent.event(async () => {
            const newConfig = await getFullConfig()
            onConfigurationChange(newConfig)
        })
    )

    // Important to respect `config.experimentalSymfContext`. The agent
    // currently crashes with a cryptic error when running with symf enabled so
    // we need a way to reliably disable symf until we fix the root problem.
    if (symfRunner && config.experimentalSymfContext) {
        const searchViewProvider = new SearchViewProvider(context.extensionUri, symfRunner)
        disposables.push(searchViewProvider)
        searchViewProvider.initialize()
        disposables.push(
            vscode.window.registerWebviewViewProvider('cody.search', searchViewProvider, {
                webviewOptions: { retainContextWhenHidden: true },
            })
        )
    }

    // Adds a change listener to the auth provider that syncs the auth status
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    authProvider.addChangeListener(async (authStatus: AuthStatus) => {
        // Chat Manager uses Simple Context Provider
        await chatManager.syncAuthStatus(authStatus)
        // Update context provider first it will also update the configuration
        await contextProvider.syncAuthStatus()
        // feature flag provider
        featureFlagProvider.syncAuthStatus()
        // Symf
        if (symfRunner && authStatus.isLoggedIn) {
            getAccessToken()
                .then(token => {
                    symfRunner.setSourcegraphAuth(authStatus.endpoint, token)
                })
                .catch(() => {})
        } else {
            symfRunner?.setSourcegraphAuth(null, null)
        }

        setupAutocomplete()
    })
    // Sync initial auth status
    await chatManager.syncAuthStatus(authProvider.getAuthStatus())

    // Execute Cody Commands and Cody Custom Commands
    const executeCommand = async (commandKey: string, source: ChatEventSource = 'editor'): Promise<void> => {
        const command = await commandsController?.findCommand(commandKey)
        if (!command) {
            return
        }
        // If it's not a ask command, it's a fixup command. If it's a fixup request, we can exit early
        // This is because findCommand will start the CommandRunner,
        // which would send all fixup requests to the FixupController
        if (command.mode !== 'ask') {
            return
        }

        return chatManager.executeCommand(command, source)
    }

    const statusBar = createStatusBar()

    disposables.push(
        // Tests
        // Access token - this is only used in configuration tests
        vscode.commands.registerCommand('cody.test.token', async (url, token) => authProvider.auth(url, token)),
        // Auth
        vscode.commands.registerCommand('cody.auth.signin', () => authProvider.signinMenu()),
        vscode.commands.registerCommand('cody.auth.signout', () => authProvider.signoutMenu()),
        vscode.commands.registerCommand('cody.auth.account', () => authProvider.accountMenu()),
        vscode.commands.registerCommand('cody.auth.support', () => showFeedbackSupportQuickPick()),
        vscode.commands.registerCommand('cody.auth.status', () => authProvider.getAuthStatus()), // Used by the agent
        // Commands
        vscode.commands.registerCommand('cody.chat.restart', async () => {
            const confirmation = await vscode.window.showWarningMessage(
                'Restart Chat Session',
                { modal: true, detail: 'Restarting the chat session will erase the chat transcript.' },
                'Restart Chat Session'
            )
            if (!confirmation) {
                return
            }
            await chatManager.clearAndRestartSession()
            telemetryService.log('CodyVSCodeExtension:chatTitleButton:clicked', { name: 'clear' }, { hasV2Event: true })
            telemetryRecorder.recordEvent('cody.interactive.clear', 'clicked', { privateMetadata: { name: 'clear' } })
        }),
        vscode.commands.registerCommand('cody.focus', () => vscode.commands.executeCommand('cody.chat.focus')),
        vscode.commands.registerCommand('cody.settings.extension', () =>
            vscode.commands.executeCommand('workbench.action.openSettings', { query: '@ext:sourcegraph.cody-ai' })
        ),
        vscode.commands.registerCommand('cody.settings.extension.chat', () =>
            vscode.commands.executeCommand('workbench.action.openSettings', { query: '@ext:sourcegraph.cody-ai chat' })
        ),
        // Recipes
        vscode.commands.registerCommand('cody.action.chat', async (input: string, source?: ChatEventSource) =>
            executeCommand(`/ask ${input}`, source)
        ),
        vscode.commands.registerCommand('cody.action.commands.menu', async () => {
            await editor.controllers.command?.menu('default')
        }),
        vscode.commands.registerCommand(
            'cody.action.commands.custom.menu',
            () => editor.controllers.command?.menu('custom')
        ),
        vscode.commands.registerCommand('cody.settings.commands', () => editor.controllers.command?.menu('config')),
        vscode.commands.registerCommand('cody.action.commands.exec', async title => executeCommand(title)),
        vscode.commands.registerCommand('cody.command.explain-code', async () => executeCommand('/explain')),
        vscode.commands.registerCommand('cody.command.generate-tests', async () => executeCommand('/test')),
        vscode.commands.registerCommand('cody.command.document-code', async () => executeCommand('/doc')),
        vscode.commands.registerCommand('cody.command.smell-code', async () => executeCommand('/smell')),

        // Account links
        vscode.commands.registerCommand('cody.show-page', (page: string) => {
            let url: URL
            switch (page) {
                case 'upgrade':
                    url = ACCOUNT_UPGRADE_URL
                    break
                case 'usage':
                    url = ACCOUNT_USAGE_URL
                    break
                case 'rate-limits':
                    url = ACCOUNT_LIMITS_INFO_URL
                    break
                default:
                    console.warn(`Unable to show unknown page: "${page}"`)
                    return
            }
            void vscode.env.openExternal(vscode.Uri.parse(url.toString()))
        }),

        // Account links
        vscode.commands.registerCommand(
            'cody.show-rate-limit-modal',
            async (userMessage: string, retryMessage: string, upgradeAvailable: boolean) => {
                if (upgradeAvailable) {
                    const option = await vscode.window.showInformationMessage(
                        'Upgrade to Cody Pro',
                        {
                            modal: true,
                            detail: `${userMessage}\n\nUpgrade to Cody Pro for unlimited autocomplete suggestions, chat messages and commands.\n\n${retryMessage}`,
                        },
                        'Upgrade',
                        'See Plans'
                    )
                    // Both options go to the same URL
                    if (option) {
                        void vscode.env.openExternal(vscode.Uri.parse(ACCOUNT_UPGRADE_URL.toString()))
                    }
                } else {
                    const option = await vscode.window.showInformationMessage(
                        'Rate Limit Exceeded',
                        { modal: true, detail: `${userMessage}\n\n${retryMessage}` },
                        'Learn More'
                    )
                    if (option) {
                        void vscode.env.openExternal(vscode.Uri.parse(ACCOUNT_LIMITS_INFO_URL.toString()))
                    }
                }
            }
        ),

        // Register URI Handler (vscode://sourcegraph.cody-ai)
        vscode.window.registerUriHandler({
            handleUri: async (uri: vscode.Uri) => {
                if (uri.path === '/app-done') {
                    await chatManager.simplifiedOnboardingReloadEmbeddingsState()
                } else {
                    await authProvider.tokenCallbackHandler(uri, config.customHeaders)
                }
            },
        }),
        statusBar,
        // Walkthrough / Support
        vscode.commands.registerCommand('cody.feedback', () =>
            vscode.env.openExternal(vscode.Uri.parse(CODY_FEEDBACK_URL.href))
        ),
        vscode.commands.registerCommand('cody.welcome', async () => {
            telemetryService.log('CodyVSCodeExtension:walkthrough:clicked', { page: 'welcome' }, { hasV2Event: true })
            telemetryRecorder.recordEvent('cody.walkthrough', 'clicked')
            // Hack: We have to run this twice to force VS Code to register the walkthrough
            // Open issue: https://github.com/microsoft/vscode/issues/186165
            await vscode.commands.executeCommand('workbench.action.openWalkthrough')
            return vscode.commands.executeCommand(
                'workbench.action.openWalkthrough',
                'sourcegraph.cody-ai#welcome',
                false
            )
        }),
        vscode.commands.registerCommand('cody.welcome-mock', () =>
            vscode.commands.executeCommand('workbench.action.openWalkthrough', 'sourcegraph.cody-ai#welcome', false)
        ),
        vscode.commands.registerCommand('cody.walkthrough.showLogin', () =>
            vscode.commands.executeCommand('workbench.view.extension.cody')
        ),
        vscode.commands.registerCommand('cody.walkthrough.showChat', () => chatManager.setWebviewView('chat')),
        vscode.commands.registerCommand('cody.walkthrough.showFixup', () => chatManager.setWebviewView('chat')),
        vscode.commands.registerCommand('cody.walkthrough.showExplain', async () => {
            telemetryService.log(
                'CodyVSCodeExtension:walkthrough:clicked',
                { page: 'showExplain' },
                { hasV2Event: true }
            )
            telemetryRecorder.recordEvent('cody.walkthrough.showExplain', 'clicked')
            await chatManager.setWebviewView('chat')
        }),
        vscode.commands.registerCommand('agent.auth.reload', async () => {
            await authProvider.reloadAuthStatus()
        }),
        // Check if user has just moved back from a browser window to upgrade cody pro
        vscode.window.onDidChangeWindowState(async ws => {
            const authStatus = authProvider.getAuthStatus()
            const endpoint = authStatus.endpoint
            if (ws.focused && endpoint && isDotCom(endpoint) && authStatus.isLoggedIn) {
                const res = await graphqlClient.getCurrentUserCodyProEnabled()
                if (res instanceof Error) {
                    console.error(res)
                    return
                }
                authStatus.userCanUpgrade = !res.codyProEnabled
                void chatManager.syncAuthStatus(authStatus)
            }
        })
    )

    /**
     * Signed out status bar indicator
     */
    let removeAuthStatusBarError: undefined | (() => void)
    function updateAuthStatusBarIndicator(): void {
        if (removeAuthStatusBarError) {
            removeAuthStatusBarError()
            removeAuthStatusBarError = undefined
        }
        if (!authProvider.getAuthStatus().isLoggedIn) {
            removeAuthStatusBarError = statusBar.addError({
                title: 'Sign In to Use Cody',
                errorType: 'auth',
                description: 'You need to sign in to use Cody.',
                onSelect: () => {
                    void chatManager.setWebviewView('chat')
                },
            })
        }
    }
    authProvider.addChangeListener(() => updateAuthStatusBarIndicator())
    updateAuthStatusBarIndicator()

    let completionsProvider: vscode.Disposable | null = null
    let setupAutocompleteQueue = Promise.resolve() // Create a promise chain to avoid parallel execution
    disposables.push({ dispose: () => completionsProvider?.dispose() })
    function setupAutocomplete(): void {
        setupAutocompleteQueue = setupAutocompleteQueue
            .then(async () => {
                const config = getConfiguration(vscode.workspace.getConfiguration())
                if (!config.autocomplete) {
                    completionsProvider?.dispose()
                    completionsProvider = null
                    if (config.isRunningInsideAgent) {
                        throw new Error(
                            'The setting `config.autocomplete` evaluated to `false`. It must be true when running inside the agent. ' +
                                'To fix this problem, make sure that the setting cody.autocomplete.enabled has the value true.'
                        )
                    }
                    return
                }

                if (completionsProvider !== null) {
                    // If completions are already initialized and still enabled, we
                    // need to reset the completion provider.
                    completionsProvider.dispose()
                }

                completionsProvider = await createInlineCompletionItemProvider({
                    config,
                    client: codeCompletionsClient,
                    statusBar,
                    authProvider,
                    triggerNotice: notice => {
                        void chatManager.triggerNotice(notice)
                    },
                    createBfgRetriever: platform.createBfgRetriever,
                })
            })
            .catch(error => {
                console.error('Error creating inline completion item provider:', error)
            })
    }

    setupAutocomplete()

    if (initialConfig.experimentalGuardrails) {
        const guardrailsProvider = new GuardrailsProvider(guardrails, editor)
        disposables.push(
            vscode.commands.registerCommand('cody.guardrails.debug', async () => {
                await guardrailsProvider.debugEditorSelection()
            })
        )
    }

    void showSetupNotification(initialConfig)

    // Register a serializer for reviving the chat panel on reload
    if (vscode.window.registerWebviewPanelSerializer) {
        vscode.window.registerWebviewPanelSerializer(CodyChatPanelViewType, {
            async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, chatID: string) {
                if (chatID && webviewPanel.title) {
                    logDebug('main:deserializeWebviewPanel', 'reviving last unclosed chat panel')
                    await chatManager.revive(webviewPanel, chatID)
                }
            },
        })
    }

    return {
        disposable: vscode.Disposable.from(...disposables),
        onConfigurationChange,
    }
}

/**
 * Create or update events infrastructure, both legacy (telemetryService) and
 * new (telemetryRecorder)
 */
async function configureEventsInfra(
    config: ConfigurationWithAccessToken,
    isExtensionModeDevOrTest: boolean
): Promise<void> {
    await createOrUpdateEventLogger(config, isExtensionModeDevOrTest)
    await createOrUpdateTelemetryRecorderProvider(config, isExtensionModeDevOrTest)
}
