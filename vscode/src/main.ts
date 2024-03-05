import * as vscode from 'vscode'

import {
    type ChatEventSource,
    ConfigFeaturesSingleton,
    type ConfigurationWithAccessToken,
    PromptMixin,
    featureFlagProvider,
    graphqlClient,
    isDotCom,
    newPromptMixin,
    setLogger,
} from '@sourcegraph/cody-shared'

import type { DefaultCodyCommands } from '@sourcegraph/cody-shared/src/commands/types'
import { ContextProvider } from './chat/ContextProvider'
import type { MessageProviderOptions } from './chat/MessageProvider'
import { ChatManager, CodyChatPanelViewType } from './chat/chat-view/ChatManager'
import type { ChatSession } from './chat/chat-view/SimpleChatPanelProvider'
import {
    ACCOUNT_LIMITS_INFO_URL,
    ACCOUNT_UPGRADE_URL,
    type AuthStatus,
    CODY_FEEDBACK_URL,
} from './chat/protocol'
import { CodeActionProvider } from './code-actions/CodeActionProvider'
import { executeCodyCommand, setCommandController } from './commands/CommandsController'
import { GhostHintDecorator } from './commands/GhostHintDecorator'
import {
    executeDocCommand,
    executeExplainCommand,
    executeExplainOutput,
    executeSmellCommand,
    executeTestCaseEditCommand,
    executeTestChatCommand,
    executeTestEditCommand,
} from './commands/execute'
import type { CodyCommandArgs } from './commands/types'
import { newCodyCommandArgs } from './commands/utils/get-commands'
import { createInlineCompletionItemProvider } from './completions/create-inline-completion-item-provider'
import { getConfiguration, getFullConfig } from './configuration'
import { EnterpriseContextFactory } from './context/enterprise-context-factory'
import { EditManager } from './edit/manager'
import { manageDisplayPathEnvInfoForExtension } from './editor/displayPathEnvInfo'
import { VSCodeEditor } from './editor/vscode-editor'
import type { PlatformContext } from './extension.common'
import { configureExternalServices } from './external-services'
import { logDebug, logError } from './log'
import type { FixupTask } from './non-stop/FixupTask'
import { CodyProExpirationNotifications } from './notifications/cody-pro-expiration'
import { showSetupNotification } from './notifications/setup-notification'
import { gitAPIinit } from './repository/repositoryHelpers'
import { SearchViewProvider } from './search/SearchViewProvider'
import { AuthProvider } from './services/AuthProvider'
import { showFeedbackSupportQuickPick } from './services/FeedbackOptions'
import { GuardrailsProvider } from './services/GuardrailsProvider'
import { displayHistoryQuickPick } from './services/HistoryChat'
import { localStorage } from './services/LocalStorageProvider'
import { VSCodeSecretStorage, getAccessToken, secretStorage } from './services/SecretStorageProvider'
import { registerSidebarCommands } from './services/SidebarCommands'
import { createStatusBar } from './services/StatusBar'
import { setUpCodyIgnore } from './services/cody-ignore'
import { createOrUpdateEventLogger, telemetryService } from './services/telemetry'
import { createOrUpdateTelemetryRecorderProvider, telemetryRecorder } from './services/telemetry-v2'
import { onTextDocumentChange } from './services/utils/codeblock-action-tracker'
import { exportOutputLog } from './services/utils/export-logs'
import { parseAllVisibleDocuments, updateParseTreeOnEdit } from './tree-sitter/parse-tree-cache'

/**
 * Start the extension, watching all relevant configuration and secrets for changes.
 */
export async function start(
    context: vscode.ExtensionContext,
    platform: PlatformContext
): Promise<vscode.Disposable> {
    // Set internal storage fields for storage provider singletons
    localStorage.setStorage(context.globalState)
    if (secretStorage instanceof VSCodeSecretStorage) {
        secretStorage.setStorage(context.secrets)
    }

    setLogger({ logDebug, logError })

    const disposables: vscode.Disposable[] = []

    const { disposable, onConfigurationChange } = await register(
        context,
        await getFullConfig(),
        platform
    )
    disposables.push(disposable)

    // Re-initialize when configuration
    disposables.push(
        vscode.workspace.onDidChangeConfiguration(async event => {
            if (event.affectsConfiguration('cody')) {
                const config = await getFullConfig()
                await onConfigurationChange(config)
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
    platform: PlatformContext
): Promise<{
    disposable: vscode.Disposable
    onConfigurationChange: (newConfig: ConfigurationWithAccessToken) => Promise<void>
}> => {
    const disposables: vscode.Disposable[] = []
    // Initialize `displayPath` first because it might be used to display paths in error messages
    // from the subsequent initialization.
    disposables.push(manageDisplayPathEnvInfoForExtension())

    // Set codyignore list after git extension startup
    disposables.push(await gitAPIinit())

    const isExtensionModeDevOrTest =
        context.extensionMode === vscode.ExtensionMode.Development ||
        context.extensionMode === vscode.ExtensionMode.Test
    await configureEventsInfra(initialConfig, isExtensionModeDevOrTest)

    const editor = new VSCodeEditor()

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
        chatClient,
        codeCompletionsClient,
        guardrails,
        localEmbeddings,
        contextRanking,
        onConfigurationChange: externalServicesOnDidConfigurationChange,
        symfRunner,
    } = await configureExternalServices(context, initialConfig, platform)

    if (symfRunner) {
        disposables.push(symfRunner)
    }

    const enterpriseContextFactory = new EnterpriseContextFactory()
    disposables.push(enterpriseContextFactory)

    const contextProvider = new ContextProvider(
        initialConfig,
        editor,
        symfRunner,
        authProvider,
        localEmbeddings,
        enterpriseContextFactory.createRemoteSearch()
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
    }

    const chatManager = new ChatManager(
        {
            ...messageProviderOptions,
            extensionUri: context.extensionUri,
            config,
        },
        chatClient,
        enterpriseContextFactory,
        localEmbeddings || null,
        contextRanking || null,
        symfRunner || null,
        guardrails
    )

    const ghostHintDecorator = new GhostHintDecorator(authProvider)
    const editorManager = new EditManager({
        chat: chatClient,
        editor,
        contextProvider,
        ghostHintDecorator,
        authProvider,
    })
    disposables.push(ghostHintDecorator, editorManager, new CodeActionProvider({ contextProvider }))

    let oldConfig = JSON.stringify(initialConfig)
    async function onConfigurationChange(newConfig: ConfigurationWithAccessToken): Promise<void> {
        if (oldConfig === JSON.stringify(newConfig)) {
            return Promise.resolve()
        }
        const promises: Promise<void>[] = []
        oldConfig = JSON.stringify(newConfig)

        promises.push(featureFlagProvider.syncAuthStatus())
        graphqlClient.onConfigurationChange(newConfig)
        promises.push(contextProvider.onConfigurationChange(newConfig))
        externalServicesOnDidConfigurationChange(newConfig)
        promises.push(configureEventsInfra(newConfig, isExtensionModeDevOrTest))
        platform.onConfigurationChange?.(newConfig)
        symfRunner?.setSourcegraphAuth(newConfig.serverEndpoint, newConfig.accessToken)
        enterpriseContextFactory.clientConfigurationDidChange()
        promises.push(
            localEmbeddings?.setAccessToken(newConfig.serverEndpoint, newConfig.accessToken) ??
                Promise.resolve()
        )
        promises.push(setupAutocomplete())
        await Promise.all(promises)
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
            await onConfigurationChange(newConfig)
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
    authProvider.addChangeListener(async (authStatus: AuthStatus) => {
        // Chat Manager uses Simple Context Provider
        await chatManager.syncAuthStatus(authStatus)
        editorManager.syncAuthStatus(authStatus)
        // Update context provider first it will also update the configuration
        await contextProvider.syncAuthStatus()
        const parallelPromises: Promise<void>[] = []
        parallelPromises.push(featureFlagProvider.syncAuthStatus())
        // feature flag provider
        // Symf
        if (symfRunner && authStatus.isLoggedIn) {
            parallelPromises.push(
                getAccessToken()
                    .then(token => symfRunner.setSourcegraphAuth(authStatus.endpoint, token))
                    .catch(() => {})
            )
        } else {
            symfRunner?.setSourcegraphAuth(null, null)
        }

        parallelPromises.push(setupAutocomplete())
        await Promise.all(parallelPromises)
    })
    // Sync initial auth status
    await chatManager.syncAuthStatus(authProvider.getAuthStatus())

    const commandsManager = platform.createCommandsProvider?.()
    setCommandController(commandsManager)

    // Execute Cody Commands and Cody Custom Commands
    const executeCommand = (
        commandKey: DefaultCodyCommands | string,
        args?: Partial<CodyCommandArgs>
    ): Promise<CommandResult | undefined> => {
        return executeCommandUnsafe(commandKey, args).catch(error => {
            if (error instanceof Error) {
                console.log(error.stack)
            }
            logError('executeCommand', commandKey, args, error)
            return undefined
        })
    }

    const executeCommandUnsafe = async (
        id: DefaultCodyCommands | string,
        args?: Partial<CodyCommandArgs>
    ): Promise<CommandResult | undefined> => {
        const { commands } = await ConfigFeaturesSingleton.getInstance().getConfigFeatures()
        if (!commands) {
            void vscode.window.showErrorMessage(
                'This feature has been disabled by your Sourcegraph site admin.'
            )
            return undefined
        }

        // Process command with the commands controller
        return await executeCodyCommand(id, newCodyCommandArgs(args))
    }

    // Register Cody Commands
    disposables.push(
        vscode.commands.registerCommand('cody.action.command', (id, a) => executeCommand(id, a)),
        vscode.commands.registerCommand('cody.command.explain-code', a => executeExplainCommand(a)),
        vscode.commands.registerCommand('cody.command.smell-code', a => executeSmellCommand(a)),
        vscode.commands.registerCommand('cody.command.document-code', a => executeDocCommand(a)),
        vscode.commands.registerCommand('cody.command.generate-tests', a => executeTestChatCommand(a)),
        vscode.commands.registerCommand('cody.command.unit-tests', a => executeTestEditCommand(a)),
        vscode.commands.registerCommand('cody.command.tests-cases', a => executeTestCaseEditCommand(a)),
        vscode.commands.registerCommand('cody.command.explain-output', a => executeExplainOutput(a))
    )

    const statusBar = createStatusBar()

    disposables.push(
        // Tests
        // Access token - this is only used in configuration tests
        vscode.commands.registerCommand('cody.test.token', async (url, token) =>
            authProvider.auth(url, token)
        ),
        // Auth
        vscode.commands.registerCommand('cody.auth.signin', () => authProvider.signinMenu()),
        vscode.commands.registerCommand('cody.auth.signout', () => authProvider.signoutMenu()),
        vscode.commands.registerCommand('cody.auth.account', () => authProvider.accountMenu()),
        vscode.commands.registerCommand('cody.auth.support', () => showFeedbackSupportQuickPick()),
        vscode.commands.registerCommand('cody.auth.status', () => authProvider.getAuthStatus()), // Used by the agent
        vscode.commands.registerCommand(
            'cody.agent.auth.authenticate',
            async ({ serverEndpoint, accessToken, customHeaders }) => {
                if (typeof serverEndpoint !== 'string') {
                    throw new TypeError('serverEndpoint is required')
                }
                if (typeof accessToken !== 'string') {
                    throw new TypeError('accessToken is required')
                }
                return (await authProvider.auth(serverEndpoint, accessToken, customHeaders)).authStatus
            }
        ),
        // Chat
        vscode.commands.registerCommand('cody.focus', () =>
            vscode.commands.executeCommand('cody.chat.focus')
        ),
        vscode.commands.registerCommand('cody.settings.extension', () =>
            vscode.commands.executeCommand('workbench.action.openSettings', {
                query: '@ext:sourcegraph.cody-ai',
            })
        ),
        vscode.commands.registerCommand('cody.chat.history.panel', async () => {
            await displayHistoryQuickPick(authProvider.getAuthStatus())
        }),
        vscode.commands.registerCommand('cody.settings.extension.chat', () =>
            vscode.commands.executeCommand('workbench.action.openSettings', {
                query: '@ext:sourcegraph.cody-ai chat',
            })
        ),

        // Account links
        ...registerSidebarCommands(),

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
                        {
                            modal: true,
                            detail: `${userMessage}\n\n${retryMessage}`,
                        },
                        'Learn More'
                    )
                    if (option) {
                        void vscode.env.openExternal(
                            vscode.Uri.parse(ACCOUNT_LIMITS_INFO_URL.toString())
                        )
                    }
                }
            }
        ),

        // Register URI Handler (e.g. vscode://sourcegraph.cody-ai)
        vscode.window.registerUriHandler({
            handleUri: async (uri: vscode.Uri) => {
                if (uri.path === '/app-done') {
                    // This is an old re-entrypoint from App that is a no-op now.
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
            telemetryService.log(
                'CodyVSCodeExtension:walkthrough:clicked',
                { page: 'welcome' },
                { hasV2Event: true }
            )
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
            vscode.commands.executeCommand(
                'workbench.action.openWalkthrough',
                'sourcegraph.cody-ai#welcome',
                false
            )
        ),
        vscode.commands.registerCommand('cody.walkthrough.showLogin', () =>
            vscode.commands.executeCommand('workbench.view.extension.cody')
        ),
        vscode.commands.registerCommand('cody.walkthrough.showChat', () =>
            chatManager.setWebviewView('chat')
        ),
        vscode.commands.registerCommand('cody.walkthrough.showFixup', () =>
            chatManager.setWebviewView('chat')
        ),
        vscode.commands.registerCommand('cody.walkthrough.showExplain', async () => {
            telemetryService.log(
                'CodyVSCodeExtension:walkthrough:clicked',
                { page: 'showExplain' },
                { hasV2Event: true }
            )
            telemetryRecorder.recordEvent('cody.walkthrough.showExplain', 'clicked')
            await chatManager.setWebviewView('chat')
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
        }),
        new CodyProExpirationNotifications(
            graphqlClient,
            authProvider,
            featureFlagProvider,
            vscode.window.showInformationMessage,
            vscode.env.openExternal
        ),
        // For register sidebar clicks
        vscode.commands.registerCommand('cody.sidebar.click', (name: string, command: string) => {
            const source: ChatEventSource = 'sidebar'
            telemetryService.log(`CodyVSCodeExtension:command:${name}:clicked`, { source })
            telemetryRecorder.recordEvent(`cody.command.${name}`, 'clicked', {
                privateMetadata: { source },
            })
            void vscode.commands.executeCommand(command, [source])
        }),
        ...setUpCodyIgnore(initialConfig),
        vscode.commands.registerCommand('cody.debug.export.logs', () => exportOutputLog(context.logUri))
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
                    // Bring up the sidebar view
                    void vscode.commands.executeCommand('cody.focus')
                },
            })
        }
    }
    authProvider.addChangeListener(() => updateAuthStatusBarIndicator())
    updateAuthStatusBarIndicator()

    let setupAutocompleteQueue = Promise.resolve() // Create a promise chain to avoid parallel execution

    let autocompleteDisposables: vscode.Disposable[] = []
    function disposeAutocomplete(): void {
        if (autocompleteDisposables) {
            for (const d of autocompleteDisposables) {
                d.dispose()
            }
            autocompleteDisposables = []
        }
    }
    disposables.push({
        dispose: disposeAutocomplete,
    })

    function setupAutocomplete(): Promise<void> {
        setupAutocompleteQueue = setupAutocompleteQueue
            .then(async () => {
                const config = await getFullConfig()
                if (!config.autocomplete) {
                    disposeAutocomplete()
                    if (config.isRunningInsideAgent) {
                        throw new Error(
                            'The setting `config.autocomplete` evaluated to `false`. It must be true when running inside the agent. ' +
                                'To fix this problem, make sure that the setting cody.autocomplete.enabled has the value true.'
                        )
                    }
                    return
                }

                // If completions are already initialized and still enabled, we need to reset the
                // completion provider.
                disposeAutocomplete()

                const autocompleteFeatureFlagChangeSubscriber = featureFlagProvider.onFeatureFlagChanged(
                    'cody-autocomplete',
                    setupAutocomplete
                )
                autocompleteDisposables.push({ dispose: autocompleteFeatureFlagChangeSubscriber })
                autocompleteDisposables.push(
                    await createInlineCompletionItemProvider({
                        config,
                        client: codeCompletionsClient,
                        statusBar,
                        authProvider,
                        triggerNotice: notice => {
                            void chatManager.triggerNotice(notice)
                        },
                        createBfgRetriever: platform.createBfgRetriever,
                    })
                )
            })
            .catch(error => {
                console.error('Error creating inline completion item provider:', error)
            })
        return setupAutocompleteQueue
    }

    const autocompleteSetup = setupAutocomplete().catch(() => {})

    if (initialConfig.experimentalGuardrails) {
        const guardrailsProvider = new GuardrailsProvider(guardrails, editor)
        disposables.push(
            vscode.commands.registerCommand('cody.guardrails.debug', async () => {
                await guardrailsProvider.debugEditorSelection()
            })
        )
    }

    // INC-267 do NOT await on this promise. This promise triggers
    // `vscode.window.showInformationMessage()`, which only resolves after the
    // user has clicked on "Setup". Awaiting on this promise will make the Cody
    // extension timeout during activation.
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

    await autocompleteSetup

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

export type CommandResult = ChatCommandResult | EditCommandResult
export interface ChatCommandResult {
    type: 'chat'
    session?: ChatSession
}
export interface EditCommandResult {
    type: 'edit'
    task?: FixupTask
}
