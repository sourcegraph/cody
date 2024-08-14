import * as vscode from 'vscode'

import {
    type ChatClient,
    ClientConfigSingleton,
    type CodeCompletionsClient,
    type Configuration,
    type ConfigurationWithAccessToken,
    type ConfigurationWithEndpoint,
    type DefaultCodyCommands,
    type Guardrails,
    PromptString,
    contextFiltersProvider,
    featureFlagProvider,
    graphqlClient,
    modelsService,
    setClientNameVersion,
    setLogger,
    subscriptionDisposable,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'
import type { CommandResult } from './CommandResult'
import type { MessageProviderOptions } from './chat/MessageProvider'
import { ChatsController, CodyChatEditorViewType } from './chat/chat-view/ChatsController'
import { ContextRetriever } from './chat/chat-view/ContextRetriever'
import type { ContextAPIClient } from './chat/context/contextAPIClient'
import {
    ACCOUNT_LIMITS_INFO_URL,
    ACCOUNT_UPGRADE_URL,
    CODY_FEEDBACK_URL,
    CODY_OLLAMA_DOCS_URL,
} from './chat/protocol'
import { CodeActionProvider } from './code-actions/CodeActionProvider'
import { commandControllerInit, executeCodyCommand } from './commands/CommandsController'
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
import { executeAutoEditCommand } from './commands/execute/auto-edit'
import { CodySourceControl } from './commands/scm/source-control'
import type { CodyCommandArgs } from './commands/types'
import { newCodyCommandArgs } from './commands/utils/get-commands'
import { createInlineCompletionItemProvider } from './completions/create-inline-completion-item-provider'
import { createInlineCompletionItemFromMultipleProviders } from './completions/create-multi-model-inline-completion-provider'
import { getFullConfig } from './configuration'
import { BaseConfigWatcher, type ConfigWatcher } from './configwatcher'
import { EnterpriseContextFactory } from './context/enterprise-context-factory'
import { exposeOpenCtxClient } from './context/openctx'
import { EditManager } from './edit/manager'
import { manageDisplayPathEnvInfoForExtension } from './editor/displayPathEnvInfo'
import { VSCodeEditor } from './editor/vscode-editor'
import type { PlatformContext } from './extension.common'
import { configureExternalServices } from './external-services'
import { isRunningInsideAgent } from './jsonrpc/isRunningInsideAgent'
import type { LocalEmbeddingsController } from './local-context/local-embeddings'
import type { SymfRunner } from './local-context/symf'
import { logDebug, logError } from './log'
import { MinionOrchestrator } from './minion/MinionOrchestrator'
import { PoorMansBash } from './minion/environment'
import { registerModelsFromVSCodeConfiguration } from './models/sync'
import { CodyProExpirationNotifications } from './notifications/cody-pro-expiration'
import { showSetupNotification } from './notifications/setup-notification'
import { initVSCodeGitApi } from './repository/git-extension-api'
import { repoNameResolver } from './repository/repo-name-resolver'
import { AuthProvider } from './services/AuthProvider'
import { CharactersLogger } from './services/CharactersLogger'
import { showFeedbackSupportQuickPick } from './services/FeedbackOptions'
import { displayHistoryQuickPick } from './services/HistoryChat'
import { localStorage } from './services/LocalStorageProvider'
import { VSCodeSecretStorage, secretStorage } from './services/SecretStorageProvider'
import { registerSidebarCommands } from './services/SidebarCommands'
import { type CodyStatusBar, createStatusBar } from './services/StatusBar'
import { upstreamHealthProvider } from './services/UpstreamHealthProvider'
import { autocompleteStageCounterLogger } from './services/autocomplete-stage-counter-logger'
import { setUpCodyIgnore } from './services/cody-ignore'
import { createOrUpdateTelemetryRecorderProvider } from './services/telemetry-v2'
import { onTextDocumentChange } from './services/utils/codeblock-action-tracker'
import {
    enableVerboseDebugMode,
    exportOutputLog,
    openCodyOutputChannel,
} from './services/utils/export-logs'
import { openCodyIssueReporter } from './services/utils/issue-reporter'
import { SupercompletionProvider } from './supercompletions/supercompletion-provider'
import { parseAllVisibleDocuments, updateParseTreeOnEdit } from './tree-sitter/parse-tree-cache'
import { version } from './version'

/**
 * Start the extension, watching all relevant configuration and secrets for changes.
 */
export async function start(
    context: vscode.ExtensionContext,
    platform: PlatformContext
): Promise<vscode.Disposable> {
    const isExtensionModeDevOrTest =
        context.extensionMode === vscode.ExtensionMode.Development ||
        context.extensionMode === vscode.ExtensionMode.Test

    // Set internal storage fields for storage provider singletons
    localStorage.setStorage(
        platform.createStorage ? await platform.createStorage() : context.globalState
    )

    if (secretStorage instanceof VSCodeSecretStorage) {
        secretStorage.setStorage(context.secrets)
    }

    setLogger({ logDebug, logError })

    const disposables: vscode.Disposable[] = []

    const authProvider = AuthProvider.create(await getFullConfig())
    const configWatcher = await BaseConfigWatcher.create(authProvider, disposables)
    disposables.push(
        subscriptionDisposable(
            configWatcher.changes.subscribe({
                next: config => configureEventsInfra(config, isExtensionModeDevOrTest, authProvider),
            })
        )
    )
    // The split between AuthProvider construction and initialization is
    // awkward, but exists so we can initialize the telemetry recorder
    // first, as it is used in AuthProvider before AuthProvider initialization
    // is complete. It is also important that AuthProvider inintialization
    // completes before initializeSingletons is called, because many of
    // those assume an initialized AuthProvider
    await authProvider.init()

    disposables.push(
        subscriptionDisposable(
            configWatcher.changes.subscribe({
                next: config => {
                    platform.onConfigurationChange?.(config)
                    registerModelsFromVSCodeConfiguration()
                },
            })
        )
    )

    disposables.push(
        await register(context, authProvider, configWatcher, platform, isExtensionModeDevOrTest)
    )

    return vscode.Disposable.from(...disposables)
}

// Registers commands and webview given the config.
const register = async (
    context: vscode.ExtensionContext,
    authProvider: AuthProvider,
    configWatcher: ConfigWatcher<ConfigurationWithAccessToken>,
    platform: PlatformContext,
    isExtensionModeDevOrTest: boolean
): Promise<vscode.Disposable> => {
    const disposables: vscode.Disposable[] = []
    setClientNameVersion(platform.extensionClient.clientName, platform.extensionClient.clientVersion)

    // Initialize `displayPath` first because it might be used to display paths in error messages
    // from the subsequent initialization.
    disposables.push(manageDisplayPathEnvInfoForExtension())

    // Initialize singletons
    await initializeSingletons(
        platform,
        authProvider,
        configWatcher,
        isExtensionModeDevOrTest,
        disposables
    )

    // Ensure Git API is available
    disposables.push(await initVSCodeGitApi())

    registerParserListeners(disposables)
    registerChatListeners(disposables)

    // Initialize external services
    const {
        chatClient,
        completionsClient,
        codeCompletionsClient,
        guardrails,
        localEmbeddings,
        onConfigurationChange: externalServicesOnDidConfigurationChange,
        symfRunner,
        contextAPIClient,
    } = await configureExternalServices(context, configWatcher, platform, authProvider)
    disposables.push(
        subscriptionDisposable(
            configWatcher.changes.subscribe({
                next: config => {
                    externalServicesOnDidConfigurationChange(config)
                    localEmbeddings?.setAccessToken(config.serverEndpoint, config.accessToken)
                },
            })
        )
    )
    if (symfRunner) {
        disposables.push(symfRunner)
    }

    // Initialize enterprise context
    const enterpriseContextFactory = new EnterpriseContextFactory(completionsClient)
    disposables.push(enterpriseContextFactory)
    disposables.push(
        subscriptionDisposable(
            configWatcher.changes.subscribe({
                next: () => {
                    enterpriseContextFactory.clientConfigurationDidChange()
                },
            })
        )
    )

    const editor = new VSCodeEditor()
    const contextRetriever = new ContextRetriever(editor, symfRunner, completionsClient)

    const { chatsController } = registerChat(
        {
            context,
            platform,
            chatClient,
            guardrails,
            editor,
            authProvider,
            enterpriseContextFactory,
            localEmbeddings,
            symfRunner,
            contextAPIClient,
            contextRetriever,
        },
        disposables
    )
    disposables.push(chatsController)

    const sourceControl = new CodySourceControl(chatClient)
    const statusBar = createStatusBar()
    disposables.push(
        statusBar,
        sourceControl,
        subscriptionDisposable(
            authProvider.changes.subscribe({
                next: authStatus => {
                    sourceControl.setAuthStatus(authStatus)
                    statusBar.setAuthStatus(authStatus)
                },
            })
        )
    )

    const autocompleteSetup = registerAutocomplete(
        configWatcher,
        platform,
        authProvider,
        statusBar,
        codeCompletionsClient,
        disposables
    )
    const tutorialSetup = tryRegisterTutorial(context, disposables)
    const openCtxSetup = exposeOpenCtxClient(
        context,
        configWatcher,
        authProvider,
        platform.createOpenCtxController
    )

    registerCodyCommands(configWatcher, statusBar, sourceControl, chatClient, disposables)
    registerAuthCommands(authProvider, disposables)
    registerChatCommands(authProvider, disposables)
    disposables.push(...registerSidebarCommands())
    disposables.push(...setUpCodyIgnore(configWatcher.get()))
    registerOtherCommands(disposables)
    if (isExtensionModeDevOrTest) {
        await registerTestCommands(context, authProvider, disposables)
    }
    registerDebugCommands(context, disposables)
    registerUpgradeHandlers(configWatcher, authProvider, disposables)
    disposables.push(new CharactersLogger())

    // INC-267 do NOT await on this promise. This promise triggers
    // `vscode.window.showInformationMessage()`, which only resolves after the
    // user has clicked on "Setup". Awaiting on this promise will make the Cody
    // extension timeout during activation.
    void showSetupNotification(configWatcher.get())

    const [extensionClientDispose] = await Promise.all([
        platform.extensionClient.provide({ enterpriseContextFactory }),
        autocompleteSetup,
        openCtxSetup,
        tutorialSetup,
        registerMinion(context, configWatcher, authProvider, symfRunner, disposables),
    ])
    disposables.push(extensionClientDispose)

    return vscode.Disposable.from(...disposables)
}

async function initializeSingletons(
    platform: PlatformContext,
    authProvider: AuthProvider,
    configWatcher: ConfigWatcher<ConfigurationWithAccessToken>,
    isExtensionModeDevOrTest: boolean,
    disposables: vscode.Disposable[]
): Promise<void> {
    // Allow the VS Code app's instance of ModelsService to use local storage to persist
    // user's model choices
    modelsService.setStorage(localStorage)
    disposables.push(upstreamHealthProvider, contextFiltersProvider)
    commandControllerInit(platform.createCommandsProvider?.(), platform.extensionClient.capabilities)
    repoNameResolver.init(authProvider)
    disposables.push(
        subscriptionDisposable(
            configWatcher.changes.subscribe({
                next: config => {
                    void localStorage.setConfig(config)
                    graphqlClient.setConfig(config)
                    void featureFlagProvider.refresh()
                    contextFiltersProvider.init(repoNameResolver.getRepoNamesFromWorkspaceUri)
                    void modelsService.onConfigChange(config)
                    upstreamHealthProvider.onConfigurationChange(config)
                },
            })
        )
    )
}

// Registers listeners to trigger parsing of visible documents
function registerParserListeners(disposables: vscode.Disposable[]) {
    void parseAllVisibleDocuments()
    disposables.push(vscode.window.onDidChangeVisibleTextEditors(parseAllVisibleDocuments))
    disposables.push(vscode.workspace.onDidChangeTextDocument(updateParseTreeOnEdit))
}

function registerChatListeners(disposables: vscode.Disposable[]) {
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
}

async function registerOtherCommands(disposables: vscode.Disposable[]) {
    disposables.push(
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
        // Walkthrough / Support
        vscode.commands.registerCommand('cody.feedback', () =>
            vscode.env.openExternal(vscode.Uri.parse(CODY_FEEDBACK_URL.href))
        ),
        vscode.commands.registerCommand('cody.welcome', async () => {
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

        // StatusBar Commands
        vscode.commands.registerCommand('cody.statusBar.ollamaDocs', () => {
            vscode.commands.executeCommand('vscode.open', CODY_OLLAMA_DOCS_URL.href)
            telemetryRecorder.recordEvent('cody.statusBar.ollamaDocs', 'opened')
        })
    )
}

function registerCodyCommands(
    config: ConfigWatcher<Configuration>,
    statusBar: CodyStatusBar,
    sourceControl: CodySourceControl,
    chatClient: ChatClient,
    disposables: vscode.Disposable[]
): void {
    // Execute Cody Commands and Cody Custom Commands
    const executeCommand = (
        commandKey: DefaultCodyCommands | string,
        args?: Partial<CodyCommandArgs>
    ): Promise<CommandResult | undefined> => {
        return executeCommandUnsafe(PromptString.unsafe_fromUserQuery(commandKey), args).catch(error => {
            if (error instanceof Error) {
                console.log(error.stack)
            }
            logError('executeCommand', commandKey, args, error)
            return undefined
        })
    }

    const executeCommandUnsafe = async (
        id: DefaultCodyCommands | PromptString,
        args?: Partial<CodyCommandArgs>
    ): Promise<CommandResult | undefined> => {
        const clientConfig = await ClientConfigSingleton.getInstance().getConfig()
        if (!clientConfig?.customCommandsEnabled) {
            void vscode.window.showErrorMessage(
                'This feature has been disabled by your Sourcegraph site admin.'
            )
            return undefined
        }

        // Process command with the commands controller
        return await executeCodyCommand(id, newCodyCommandArgs(args))
    }

    // Initialize supercompletion provider if experimental feature is enabled
    if (config.get().experimentalSupercompletions) {
        disposables.push(new SupercompletionProvider({ statusBar, chat: chatClient }))
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
        vscode.commands.registerCommand('cody.command.explain-output', a => executeExplainOutput(a)),
        vscode.commands.registerCommand('cody.command.auto-edit', a => executeAutoEditCommand(a)),
        sourceControl // Generate Commit Message command
    )
}

function registerChatCommands(authProvider: AuthProvider, disposables: vscode.Disposable[]): void {
    disposables.push(
        // Chat
        vscode.commands.registerCommand('cody.settings.extension', () =>
            vscode.commands.executeCommand('workbench.action.openSettings', {
                query: '@ext:sourcegraph.cody-ai',
            })
        ),
        vscode.commands.registerCommand('cody.chat.view.popOut', async () => {
            vscode.commands.executeCommand('workbench.action.moveEditorToNewWindow')
        }),
        vscode.commands.registerCommand('cody.chat.history.panel', async () => {
            await displayHistoryQuickPick(authProvider.getAuthStatus())
        }),
        vscode.commands.registerCommand('cody.settings.extension.chat', () =>
            vscode.commands.executeCommand('workbench.action.openSettings', {
                query: '@ext:sourcegraph.cody-ai chat',
            })
        ),
        vscode.commands.registerCommand('cody.copy.version', () =>
            vscode.env.clipboard.writeText(version)
        )
    )
}

function registerAuthCommands(authProvider: AuthProvider, disposables: vscode.Disposable[]): void {
    disposables.push(
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
                return await authProvider.auth({
                    endpoint: serverEndpoint,
                    token: accessToken,
                    customHeaders,
                })
            }
        )
    )
}

function registerUpgradeHandlers(
    configWatcher: ConfigWatcher<Configuration>,
    authProvider: AuthProvider,
    disposables: vscode.Disposable[]
): void {
    disposables.push(
        // Register URI Handler (e.g. vscode://sourcegraph.cody-ai)
        vscode.window.registerUriHandler({
            handleUri: async (uri: vscode.Uri) => {
                if (uri.path === '/app-done') {
                    // This is an old re-entrypoint from App that is a no-op now.
                } else {
                    authProvider.tokenCallbackHandler(uri, configWatcher.get().customHeaders)
                }
            },
        }),

        // Check if user has just moved back from a browser window to upgrade cody pro
        vscode.window.onDidChangeWindowState(async ws => {
            const authStatus = authProvider.getAuthStatus()
            if (ws.focused && authStatus.isDotCom && authStatus.isLoggedIn) {
                const res = await graphqlClient.getCurrentUserCodyProEnabled()
                if (res instanceof Error) {
                    logError('onDidChangeWindowState', 'getCurrentUserCodyProEnabled', res)
                    return
                }
                // Re-auth if user's cody pro status has changed
                const isCurrentCodyProUser = !authStatus.userCanUpgrade
                if (res.codyProEnabled !== isCurrentCodyProUser) {
                    authProvider.reloadAuthStatus()
                }
            }
        }),
        new CodyProExpirationNotifications(
            graphqlClient,
            authProvider,
            featureFlagProvider,
            vscode.window.showInformationMessage,
            vscode.env.openExternal
        )
    )
}

/**
 * Register commands used in internal tests
 */
async function registerTestCommands(
    context: vscode.ExtensionContext,
    authProvider: AuthProvider,
    disposables: vscode.Disposable[]
): Promise<void> {
    await vscode.commands.executeCommand('setContext', 'cody.devOrTest', true)
    disposables.push(
        vscode.commands.registerCommand('cody.test.set-context-filters', async () => {
            // Prompt the user for the policy
            const raw = await vscode.window.showInputBox({ title: 'Context Filters Overwrite' })
            if (!raw) {
                return
            }
            try {
                const policy = JSON.parse(raw)
                contextFiltersProvider.setTestingContextFilters(policy)
            } catch (error) {
                vscode.window.showErrorMessage(
                    'Failed to parse context filters policy. Please check your JSON syntax.'
                )
            }
        }),
        // Access token - this is only used in configuration tests
        vscode.commands.registerCommand('cody.test.token', async (endpoint, token) =>
            authProvider.auth({ endpoint, token })
        )
    )
}

/**
 * Register commands used for debugging.
 */
async function registerDebugCommands(
    context: vscode.ExtensionContext,
    disposables: vscode.Disposable[]
): Promise<void> {
    disposables.push(
        vscode.commands.registerCommand('cody.debug.export.logs', () => exportOutputLog(context.logUri)),
        vscode.commands.registerCommand('cody.debug.outputChannel', () => openCodyOutputChannel()),
        vscode.commands.registerCommand('cody.debug.enable.all', () => enableVerboseDebugMode()),
        vscode.commands.registerCommand('cody.debug.reportIssue', () => openCodyIssueReporter())
    )
}

async function tryRegisterTutorial(
    context: vscode.ExtensionContext,
    disposables: vscode.Disposable[]
): Promise<void> {
    if (!isRunningInsideAgent()) {
        // TODO: The interactive tutorial is currently VS Code specific, both in terms of features and keyboard shortcuts.
        // Consider opening this up to support dynamic content via Cody Agent.
        // This would allow us the present the same tutorial but with client-specific steps.
        // Alternatively, clients may not wish to use this tutorial and instead opt for something more suitable for their environment.
        const { registerInteractiveTutorial } = await import('./tutorial')
        registerInteractiveTutorial(context).then(disposable => disposables.push(...disposable))
    }
}

/**
 * Registers autocomplete functionality. This can be long-running, so it's recommended
 * the returned promise is awaited in parallel with other tasks.
 */
function registerAutocomplete(
    configWatcher: ConfigWatcher<ConfigurationWithEndpoint>,
    platform: PlatformContext,
    authProvider: AuthProvider,
    statusBar: CodyStatusBar,
    codeCompletionsClient: CodeCompletionsClient,
    disposables: vscode.Disposable[]
): Promise<void> {
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

    const setupAutocomplete = (): Promise<void> => {
        setupAutocompleteQueue = setupAutocompleteQueue
            .then(async () => {
                const config = await getFullConfig()
                if (!config.autocomplete) {
                    disposeAutocomplete()
                    if (
                        config.isRunningInsideAgent &&
                        platform.extensionClient.capabilities?.completions !== 'none'
                    ) {
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
                autocompleteDisposables.push({
                    dispose: autocompleteFeatureFlagChangeSubscriber,
                })
                autocompleteDisposables.push(
                    await createInlineCompletionItemProvider({
                        config,
                        client: codeCompletionsClient,
                        statusBar,
                        authProvider: authProvider,
                        createBfgRetriever: platform.createBfgRetriever,
                    })
                )
                autocompleteDisposables.push(
                    await createInlineCompletionItemFromMultipleProviders({
                        config,
                        client: codeCompletionsClient,
                        statusBar,
                        authProvider: authProvider,
                        createBfgRetriever: platform.createBfgRetriever,
                    }),
                    autocompleteStageCounterLogger
                )
            })
            .catch(error => {
                logError('registerAutocomplete', 'Error creating inline completion item provider', error)
            })
        return setupAutocompleteQueue
    }
    disposables.push(
        subscriptionDisposable(configWatcher.changes.subscribe({ next: setupAutocomplete }))
    )
    return setupAutocomplete().catch(() => {})
}

async function registerMinion(
    context: vscode.ExtensionContext,
    config: ConfigWatcher<Configuration>,
    authProvider: AuthProvider,
    symfRunner: SymfRunner | undefined,
    disposables: vscode.Disposable[]
): Promise<void> {
    if (config.get().experimentalMinionAnthropicKey) {
        const minionOrchestrator = new MinionOrchestrator(context.extensionUri, authProvider, symfRunner)
        disposables.push(minionOrchestrator)
        disposables.push(
            vscode.commands.registerCommand('cody.minion.panel.new', () =>
                minionOrchestrator.createNewMinionPanel()
            ),
            vscode.commands.registerCommand('cody.minion.new-terminal', async () => {
                const t = new PoorMansBash()
                await t.run('hello world')
            })
        )
    }
}

interface RegisterChatOptions {
    context: vscode.ExtensionContext
    platform: PlatformContext
    chatClient: ChatClient
    guardrails: Guardrails
    editor: VSCodeEditor
    authProvider: AuthProvider
    enterpriseContextFactory: EnterpriseContextFactory
    localEmbeddings?: LocalEmbeddingsController
    symfRunner?: SymfRunner
    contextAPIClient?: ContextAPIClient
    contextRetriever: ContextRetriever
}

function registerChat(
    {
        context,
        platform,
        chatClient,
        guardrails,
        editor,
        authProvider,
        enterpriseContextFactory,
        localEmbeddings,
        symfRunner,
        contextAPIClient,
        contextRetriever,
    }: RegisterChatOptions,
    disposables: vscode.Disposable[]
): {
    chatsController: ChatsController
} {
    // Shared configuration that is required for chat views to send and receive messages
    const messageProviderOptions: MessageProviderOptions = {
        chat: chatClient,
        guardrails,
        editor,
        authProvider,
    }
    const chatsController = new ChatsController(
        {
            ...messageProviderOptions,
            extensionUri: context.extensionUri,
            startTokenReceiver: platform.startTokenReceiver,
        },
        chatClient,
        authProvider,
        enterpriseContextFactory,
        localEmbeddings || null,
        symfRunner || null,
        contextRetriever,
        guardrails,
        contextAPIClient || null,
        platform.extensionClient
    )
    chatsController.registerViewsAndCommands()

    const ghostHintDecorator = new GhostHintDecorator(authProvider)
    const editorManager = new EditManager({
        chat: chatClient,
        editor,
        ghostHintDecorator,
        authProvider,
        extensionClient: platform.extensionClient,
    })
    disposables.push(ghostHintDecorator, editorManager, new CodeActionProvider())

    if (localEmbeddings) {
        // kick-off embeddings initialization
        localEmbeddings.start()
    }

    // Register a serializer for reviving the chat panel on reload
    if (vscode.window.registerWebviewPanelSerializer) {
        vscode.window.registerWebviewPanelSerializer(CodyChatEditorViewType, {
            async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, chatID: string) {
                if (chatID && webviewPanel.title) {
                    logDebug('main:deserializeWebviewPanel', 'reviving last unclosed chat panel')
                    await chatsController.restoreToPanel(webviewPanel, chatID)
                }
            },
        })
    }

    return { chatsController }
}

/**
 * Create or update events infrastructure, using the new telemetryRecorder.
 */
async function configureEventsInfra(
    config: ConfigurationWithAccessToken,
    isExtensionModeDevOrTest: boolean,
    authProvider: AuthProvider
): Promise<void> {
    await createOrUpdateTelemetryRecorderProvider(config, isExtensionModeDevOrTest, authProvider)
}
