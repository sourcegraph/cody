import _, { isEqual } from 'lodash'
import { filter, map } from 'observable-fns'
import * as vscode from 'vscode'

import {
    type ChatClient,
    ClientConfigSingleton,
    type ConfigurationInput,
    DOTCOM_URL,
    type DefaultCodyCommands,
    FeatureFlag,
    NEVER,
    PromptString,
    type ResolvedConfiguration,
    type SourcegraphGuardrailsClient,
    authStatus,
    catchError,
    clientCapabilities,
    combineLatest,
    contextFiltersProvider,
    createDisposables,
    currentAuthStatus,
    distinctUntilChanged,
    featureFlagProvider,
    fromVSCodeEvent,
    isDotCom,
    isWorkspaceInstance,
    modelsService,
    resolvedConfig,
    setClientCapabilities,
    setClientNameVersion,
    setEditorWindowIsFocused,
    setLogger,
    setOpenCtxControllerObservable,
    setResolvedConfigurationObservable,
    startWith,
    subscriptionDisposable,
    switchMap,
    take,
} from '@sourcegraph/cody-shared'

import { isReinstalling } from '../uninstall/reinstall'

import type { CommandResult } from './CommandResult'
import { showAccountMenu } from './auth/account-menu'
import {
    requestEndpointSettingsDeliveryToSearchPlugin,
    showSignInMenu,
    showSignOutMenu,
    signOut,
    tokenCallbackHandler,
} from './auth/auth'
import { createAutoEditsProvider } from './autoedits/create-autoedits-provider'
import { autoeditDebugStore } from './autoedits/debug-panel/debug-store'
import { autoeditsOutputChannelLogger } from './autoedits/output-channel-logger'
import type { MessageProviderOptions } from './chat/MessageProvider'
import { CodyToolProvider } from './chat/agentic/CodyToolProvider'
import { ChatsController, CodyChatEditorViewType } from './chat/chat-view/ChatsController'
import { ContextRetriever } from './chat/chat-view/ContextRetriever'
import { SourcegraphRemoteFileProvider } from './chat/chat-view/sourcegraphRemoteFile'
import { MCPManager } from './chat/chat-view/tools/MCPManager'
import { ACCOUNT_LIMITS_INFO_URL, CODY_FEEDBACK_URL } from './chat/protocol'
import { CodeActionProvider } from './code-actions/CodeActionProvider'
import { commandControllerInit, executeCodyCommand } from './commands/CommandsController'
import { GhostHintDecorator } from './commands/GhostHintDecorator'
import {
    executeDocCommand,
    executeExplainCommand,
    executeExplainOutput,
    executeSmellCommand,
    executeTestCaseEditCommand,
    executeTestEditCommand,
} from './commands/execute'
import { executeDocChatCommand } from './commands/execute/doc'
import { executeTestChatCommand } from './commands/execute/test-chat'
import { CodySourceControl } from './commands/scm/source-control'
import type { CodyCommandArgs } from './commands/types'
import { newCodyCommandArgs } from './commands/utils/get-commands'
import { createInlineCompletionItemProvider } from './completions/create-inline-completion-item-provider'
import { getConfiguration } from './configuration'
import { observeOpenCtxController } from './context/openctx'
import { logGlobalStateEmissions } from './dev/helpers'
import { EditGuardrails } from './edit/edit-guardrails'
import { EditManager } from './edit/edit-manager'
import { SmartApplyManager } from './edit/smart-apply-manager'
import { manageDisplayPathEnvInfoForExtension } from './editor/displayPathEnvInfo'
import { VSCodeEditor } from './editor/vscode-editor'
import type { PlatformContext } from './extension.common'
import { configureExternalServices } from './external-services'
import { isRunningInsideAgent } from './jsonrpc/isRunningInsideAgent'
import { FixupController } from './non-stop/FixupController'
import { showSetupNotification } from './notifications/setup-notification'
import { logDebug, logError } from './output-channel-logger'
import { PromptsManager } from './prompts/manager'
import { initVSCodeGitApi } from './repository/git-extension-api'
import { authProvider } from './services/AuthProvider'
import { charactersLogger } from './services/CharactersLogger'
import { CodyTerminal } from './services/CodyTerminal'
import { showFeedbackSupportQuickPick } from './services/FeedbackOptions'
import { displayHistoryQuickPick } from './services/HistoryChat'
import { localStorage } from './services/LocalStorageProvider'
import { NetworkDiagnostics } from './services/NetworkDiagnostics'
import { VSCodeSecretStorage, secretStorage } from './services/SecretStorageProvider'
import { registerSidebarCommands } from './services/SidebarCommands'
import { CodyStatusBar } from './services/StatusBar'
import { createOrUpdateTelemetryRecorderProvider } from './services/telemetry-v2'
import {
    enableVerboseDebugMode,
    exportOutputLog,
    openCodyOutputChannel,
} from './services/utils/export-logs'
import { dumpCodyHeapSnapshot } from './services/utils/heap-dump'
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
    const disposables: vscode.Disposable[] = []

    //TODO: Add override flag
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

    setClientCapabilities({
        configuration: getConfiguration(),
        agentCapabilities: platform.extensionClient.capabilities,
    })

    let hasReinstallCleanupRun = false

    setResolvedConfigurationObservable(
        combineLatest(
            fromVSCodeEvent(vscode.workspace.onDidChangeConfiguration).pipe(
                filter(
                    event =>
                        event.affectsConfiguration('cody') ||
                        event.affectsConfiguration('openctx') ||
                        event.affectsConfiguration('http')
                ),
                startWith(undefined),
                map(() => getConfiguration()),
                distinctUntilChanged()
            ),
            fromVSCodeEvent(secretStorage.onDidChange.bind(secretStorage)).pipe(
                startWith(undefined),
                map(() => secretStorage)
            ),
            localStorage.clientStateChanges.pipe(distinctUntilChanged())
        ).pipe(
            map(
                ([clientConfiguration, clientSecrets, clientState]) =>
                    ({
                        clientConfiguration,
                        clientSecrets,
                        clientState,
                        reinstall: {
                            isReinstalling,
                            onReinstall: async () => {
                                // short circuit so that we only run this cleanup once, not every time the config updates
                                if (hasReinstallCleanupRun) return
                                logDebug('start', 'Reinstalling Cody')
                                // VSCode does not provide a way to simply clear all secrets
                                // associated with the extension (https://github.com/microsoft/vscode/issues/123817)
                                // So we have to build a list of all endpoints we'd expect to have been populated
                                // and clear them individually.
                                const history = await localStorage.deleteEndpointHistory()
                                const additionalEndpointsToClear = [
                                    clientConfiguration.overrideServerEndpoint,
                                    clientState.lastUsedEndpoint,
                                    DOTCOM_URL.toString(),
                                ].filter(_.isString)
                                await Promise.all(
                                    history
                                        .concat(additionalEndpointsToClear)
                                        .map(clientSecrets.deleteToken.bind(clientSecrets))
                                )
                                hasReinstallCleanupRun = true
                            },
                        },
                    }) satisfies ConfigurationInput
            )
        )
    )

    setEditorWindowIsFocused(() => vscode.window.state.focused)

    if (process.env.LOG_GLOBAL_STATE_EMISSIONS) {
        disposables.push(logGlobalStateEmissions())
    }

    disposables.push(createOrUpdateTelemetryRecorderProvider(isExtensionModeDevOrTest))
    disposables.push(await register(context, platform, isExtensionModeDevOrTest))
    return vscode.Disposable.from(...disposables)
}

// Registers commands and webview given the config.
const register = async (
    context: vscode.ExtensionContext,
    platform: PlatformContext,
    isExtensionModeDevOrTest: boolean
): Promise<vscode.Disposable> => {
    const disposables: vscode.Disposable[] = []
    setClientNameVersion({
        newClientName: platform.extensionClient.clientName,
        newClientCompletionsStreamQueryParameterName:
            platform.extensionClient.httpClientNameForLegacyReasons,
        newClientVersion: platform.extensionClient.clientVersion,
    })

    // Initialize `displayPath` first because it might be used to display paths in error messages
    // from the subsequent initialization.
    disposables.push(manageDisplayPathEnvInfoForExtension())

    // Initialize singletons
    await initializeSingletons(platform, disposables)

    setOpenCtxControllerObservable(observeOpenCtxController(context, platform.createOpenCtxController))

    // Ensure Git API is available
    disposables.push(await initVSCodeGitApi())

    registerParserListeners(disposables)

    // Initialize external services
    const {
        chatClient,
        completionsClient,
        guardrails,
        symfRunner,
        dispose: disposeExternalServices,
    } = await configureExternalServices(context, platform)
    disposables.push({ dispose: disposeExternalServices })

    const editor = new VSCodeEditor()
    const contextRetriever = new ContextRetriever(editor, symfRunner, completionsClient)

    const { chatsController } = registerChat(
        {
            context,
            platform,
            chatClient,
            guardrails,
            editor,
            contextRetriever,
        },
        disposables
    )
    const fixupController = new FixupController(platform.extensionClient)
    const ghostHintDecorator = new GhostHintDecorator({ fixupController })
    const editManager = new EditManager({
        chatClient,
        editor,
        fixupController,
        guardrails: new EditGuardrails(guardrails),
    })
    const smartApplyManager = new SmartApplyManager({ editManager, chatClient })

    CodyToolProvider.initialize(contextRetriever)

    disposables.push(chatsController, ghostHintDecorator, editManager, smartApplyManager)

    const statusBar = CodyStatusBar.init()
    disposables.push(statusBar)

    disposables.push(
        NetworkDiagnostics.init({
            statusBar,
            agent: platform.networkAgent ?? null,
            authProvider,
        })
    )

    registerAutocomplete(platform, statusBar, disposables)
    await registerCodyCommands({ statusBar, chatClient, fixupController, disposables, context })
    registerAuthCommands(disposables)
    registerChatCommands(disposables)
    disposables.push(...registerSidebarCommands())
    registerOtherCommands(disposables)
    if (clientCapabilities().isVSCode) {
        registerVSCodeOnlyFeatures(chatClient, disposables)
    }
    if (isExtensionModeDevOrTest) {
        await registerTestCommands(context, disposables)
    }
    registerDebugCommands(context, disposables)
    registerAuthenticationHandlers(disposables)
    disposables.push(charactersLogger)

    // INC-267 do NOT await on this promise. This promise triggers
    // `vscode.window.showInformationMessage()`, which only resolves after the
    // user has clicked on "Setup". Awaiting on this promise will make the Cody
    // extension timeout during activation.
    resolvedConfig.pipe(take(1)).subscribe(({ auth }) => showSetupNotification(auth))

    // Initialize MCP Manager based on the feature flag
    disposables.push(
        subscriptionDisposable(
            combineLatest(
                featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.AgenticChatWithMCP),
                featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.AgenticContextDisabled)
            )
                .pipe(
                    map(([mcpEnabled, agenticDisabled]) => mcpEnabled && !agenticDisabled),
                    distinctUntilChanged()
                )
                .subscribe(async isEnabled => {
                    if (isEnabled) {
                        await MCPManager?.init()
                    } else {
                        MCPManager?.dispose()
                    }
                })
        )
    )

    const endpoints = localStorage.getEndpointHistory() || []
    const endpointsToLogout = endpoints.filter(
        endpoint => isDotCom({ endpoint }) || isWorkspaceInstance({ endpoint })
    )

    // Logout from each dotcom and workspace endpoint
    void Promise.all(endpointsToLogout.map(endpoint => signOut(endpoint)))

    // Save config for `deactivate` handler.
    disposables.push(
        subscriptionDisposable(
            resolvedConfig.subscribe(config => {
                localStorage.setConfig(config)
            })
        )
    )

    return vscode.Disposable.from(...disposables)
}

async function initializeSingletons(
    platform: PlatformContext,
    disposables: vscode.Disposable[]
): Promise<void> {
    commandControllerInit(platform.createCommandsProvider?.(), platform.extensionClient.capabilities)

    modelsService.setStorage(localStorage)

    if (platform.otherInitialization) {
        disposables.push(platform.otherInitialization())
    }
}

// Registers listeners to trigger parsing of visible documents
function registerParserListeners(disposables: vscode.Disposable[]) {
    void parseAllVisibleDocuments()
    disposables.push(vscode.window.onDidChangeVisibleTextEditors(parseAllVisibleDocuments))
    disposables.push(vscode.workspace.onDidChangeTextDocument(updateParseTreeOnEdit))
}

async function registerOtherCommands(disposables: vscode.Disposable[]) {
    disposables.push(
        // Account links
        vscode.commands.registerCommand(
            'cody.show-rate-limit-modal',
            async (userMessage: string, retryMessage: string) => {
                const option = await vscode.window.showInformationMessage(
                    'Rate Limit Exceeded',
                    {
                        modal: true,
                        detail: `${userMessage}\n\n${retryMessage}`,
                    },
                    'Learn More'
                )
                if (option) {
                    void vscode.env.openExternal(vscode.Uri.parse(ACCOUNT_LIMITS_INFO_URL.toString()))
                }
            }
        ),
        // Walkthrough / Support
        vscode.commands.registerCommand('cody.feedback', () =>
            vscode.env.openExternal(vscode.Uri.parse(CODY_FEEDBACK_URL.href))
        )
    )
}

async function registerCodyCommands({
    statusBar,
    chatClient,
    fixupController,
    disposables,
    context,
}: {
    statusBar: CodyStatusBar
    chatClient: ChatClient
    fixupController: FixupController
    disposables: vscode.Disposable[]
    context: vscode.ExtensionContext
}): Promise<void> {
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

    // Register the execution command from above.
    disposables.push(
        vscode.commands.registerCommand('cody.action.command', (id, a) => executeCommand(id, a))
    )

    // Initialize supercompletion provider if experimental feature is enabled
    disposables.push(
        enableFeature(
            ({ configuration }) => configuration.experimentalSupercompletions,
            () => new SupercompletionProvider({ statusBar, chat: chatClient })
        )
    )

    // Initialize autoedit provider if experimental feature is enabled
    registerAutoEdits({ chatClient, fixupController, statusBar, disposables, context })

    disposables.push(
        subscriptionDisposable(
            featureFlagProvider
                .evaluatedFeatureFlag(FeatureFlag.CodyUnifiedPrompts)
                .pipe(
                    createDisposables(codyUnifiedPromptsFlag => {
                        // Commands that are available only if unified prompts feature is enabled.
                        const unifiedPromptsEnabled =
                            codyUnifiedPromptsFlag && !clientCapabilities().isCodyWeb

                        vscode.commands.executeCommand(
                            'setContext',
                            'cody.menu.custom-commands.enable',
                            !unifiedPromptsEnabled
                        )

                        // NOTE: Soon to be deprecated and replaced by unified prompts.
                        const chatCommands = [
                            // Register prompt-like command if unified prompts feature is available.
                            vscode.commands.registerCommand('cody.command.explain-code', a =>
                                executeExplainCommand(a)
                            ),
                            vscode.commands.registerCommand('cody.command.smell-code', a =>
                                executeSmellCommand(a)
                            ),
                        ]

                        // NOTE: Soon to be deprecated and replaced by unified prompts.
                        const editCommands = [
                            vscode.commands.registerCommand('cody.command.document-code', a =>
                                executeDocCommand(a)
                            ),
                        ]

                        const unitTestCommand = [
                            vscode.commands.registerCommand('cody.command.unit-tests', a =>
                                unifiedPromptsEnabled
                                    ? executeTestChatCommand(a)
                                    : executeTestEditCommand(a)
                            ),
                        ]

                        // Prompt-like commands.
                        const unifiedPromptsCommands = [
                            vscode.commands.registerCommand('cody.command.prompt-document-code', a =>
                                executeDocChatCommand(a)
                            ),
                        ]

                        // Register prompt-like command if unified prompts feature is available.
                        return unifiedPromptsEnabled
                            ? [
                                  ...chatCommands,
                                  ...editCommands,
                                  ...unitTestCommand,
                                  ...unifiedPromptsCommands,
                              ]
                            : [...chatCommands, ...editCommands, ...unitTestCommand]
                    })
                )
                .subscribe({})
        )
    )
}

/**
 * Features that are currently available only in VS Code.
 */
function registerVSCodeOnlyFeatures(chatClient: ChatClient, disposable: vscode.Disposable[]): void {
    // Generating commit message command in the VS Code Source Control Panel.
    disposable.push(new CodySourceControl(chatClient))
    // Command for executing CLI commands in the Terminal panel used by Smart Apply.
    disposable.push(new CodyTerminal())

    disposable.push(
        // Command that sends the selected output from the Terminal panel to Cody Chat for explanation.
        vscode.commands.registerCommand('cody.command.explain-output', a => executeExplainOutput(a)),
        // Internal Experimental: Command to generate additional test cases through Code Lenses in test files.
        vscode.commands.registerCommand('cody.command.tests-cases', a => executeTestCaseEditCommand(a))
    )
}

function enableFeature(
    shouldEnable: (config: ResolvedConfiguration) => boolean,
    enable: () => vscode.Disposable
): vscode.Disposable {
    let featureDisposable: vscode.Disposable | null
    const sub = resolvedConfig
        .pipe(
            map(config => shouldEnable(config)),
            distinctUntilChanged()
        )
        .subscribe(isEnabled => {
            if (featureDisposable) {
                featureDisposable.dispose()
                featureDisposable = null
            }
            if (isEnabled) {
                featureDisposable = enable()
            }
        })
    return { dispose: () => sub.unsubscribe() }
}

function registerChatCommands(disposables: vscode.Disposable[]): void {
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
            await displayHistoryQuickPick(currentAuthStatus())
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

function registerAuthCommands(disposables: vscode.Disposable[]): void {
    disposables.push(
        vscode.commands.registerCommand('cody.auth.signin', () => showSignInMenu()),
        vscode.commands.registerCommand('cody.auth.signout', () => showSignOutMenu()),
        vscode.commands.registerCommand('cody.auth.account', () => showAccountMenu()),
        vscode.commands.registerCommand('cody.auth.support', () => showFeedbackSupportQuickPick()),
        vscode.commands.registerCommand(
            'cody.auth.requestEndpointSettings',
            async () => await requestEndpointSettingsDeliveryToSearchPlugin()
        )
    )
}
/**
 * Register commands used in internal tests
 */
async function registerTestCommands(
    context: vscode.ExtensionContext,
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
        vscode.commands.registerCommand('cody.test.token', async (serverEndpoint, token) =>
            authProvider.validateAndStoreCredentials(
                { credentials: { token }, serverEndpoint },
                'always-store'
            )
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
        vscode.commands.registerCommand('cody.debug.reportIssue', () => openCodyIssueReporter()),
        vscode.commands.registerCommand('cody.debug.heapDump', () => dumpCodyHeapSnapshot())
    )
}

function registerAutoEdits({
    chatClient,
    fixupController,
    statusBar,
    disposables,
    context,
}: {
    chatClient: ChatClient
    fixupController: FixupController
    statusBar: CodyStatusBar
    disposables: vscode.Disposable[]
    context: vscode.ExtensionContext
}): void {
    const { autoedit } = clientCapabilities()
    const autoeditDisabledForClient =
        isRunningInsideAgent() && (autoedit === undefined || autoedit === 'none')
    if (autoeditDisabledForClient) {
        // Do not attempt to register autoedits for clients that have not opted in to use autoedit.
        return
    }

    disposables.push(
        autoeditDebugStore,
        subscriptionDisposable(
            combineLatest(
                resolvedConfig,
                authStatus,
                featureFlagProvider.evaluatedFeatureFlag(
                    FeatureFlag.CodyAutoEditExperimentEnabledFeatureFlag
                ),
                featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.CodyAutoEditHotStreak),
                featureFlagProvider.evaluatedFeatureFlag(
                    FeatureFlag.CodyAutoEditUseWebSocketForFireworksConnections
                )
            )
                .pipe(
                    distinctUntilChanged((a, b) => {
                        return (
                            isEqual(a[0].configuration, b[0].configuration) &&
                            isEqual(a[1], b[1]) &&
                            isEqual(a[2], b[2])
                        )
                    }),
                    switchMap(
                        ([
                            config,
                            authStatus,
                            autoeditFeatureFlagEnabled,
                            autoeditHotStreakEnabled,
                            autoeditUseWebSocketEnabled,
                        ]) => {
                            return createAutoEditsProvider({
                                config,
                                authStatus,
                                chatClient,
                                autoeditFeatureFlagEnabled,
                                autoeditHotStreakEnabled,
                                autoeditUseWebSocketEnabled,
                                fixupController,
                                statusBar,
                                context,
                            })
                        }
                    ),
                    catchError(error => {
                        autoeditsOutputChannelLogger.logError('registerAutoedits', 'Error', error)
                        return NEVER
                    })
                )
                .subscribe({})
        )
    )
}

/**
 * Registers autocomplete functionality.
 */
function registerAutocomplete(
    platform: PlatformContext,
    statusBar: CodyStatusBar,
    disposables: vscode.Disposable[]
): void {
    //@ts-ignore
    let statusBarLoader: undefined | (() => void) = statusBar.addLoader({
        title: 'Completion Provider is starting',
        kind: 'startup',
    })
    const finishLoading = () => {
        statusBarLoader?.()
        statusBarLoader = undefined
    }

    disposables.push(
        subscriptionDisposable(
            combineLatest(resolvedConfig, authStatus)
                .pipe(
                    //TODO(@rnauta -> @sqs): It feels yuk to handle the invalidation outside of
                    //where the state is picked. It's also very tedious
                    distinctUntilChanged((a, b) => {
                        return isEqual(a[0].configuration, b[0].configuration) && isEqual(a[1], b[1])
                    }),
                    switchMap(([config, authStatus]) => {
                        if (!authStatus.pendingValidation && !statusBarLoader) {
                            statusBarLoader = statusBar.addLoader({
                                title: 'Completion Provider is starting',
                            })
                        }
                        const res = createInlineCompletionItemProvider({
                            config,
                            authStatus,
                            platform,
                            statusBar,
                        })
                        if (res === NEVER && !authStatus.pendingValidation) {
                            finishLoading()
                        }
                        return res.tap(res => {
                            finishLoading()
                        })
                    }),
                    catchError(error => {
                        finishLoading()
                        //TODO: We could show something in the statusbar
                        logError('registerAutocomplete', 'Error', error)
                        return NEVER
                    })
                )
                .subscribe({})
        )
    )
}

interface RegisterChatOptions {
    context: vscode.ExtensionContext
    platform: PlatformContext
    chatClient: ChatClient
    guardrails: SourcegraphGuardrailsClient
    editor: VSCodeEditor
    contextRetriever: ContextRetriever
}

function registerChat(
    { context, platform, chatClient, guardrails, editor, contextRetriever }: RegisterChatOptions,
    disposables: vscode.Disposable[]
): {
    chatsController: ChatsController
} {
    // Shared configuration that is required for chat views to send and receive messages
    const messageProviderOptions: MessageProviderOptions = {
        chat: chatClient,
        guardrails,
        editor,
    }
    const chatsController = new ChatsController(
        {
            ...messageProviderOptions,
            extensionUri: context.extensionUri,
            startTokenReceiver: platform.startTokenReceiver,
        },
        chatClient,
        contextRetriever,
        guardrails,
        platform.extensionClient
    )
    chatsController.registerViewsAndCommands()
    const promptsManager = new PromptsManager({ chatsController })
    const sourcegraphRemoteFileProvider = new SourcegraphRemoteFileProvider()

    disposables.push(new CodeActionProvider(), promptsManager, sourcegraphRemoteFileProvider)

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

function registerAuthenticationHandlers(disposables: vscode.Disposable[]): void {
    disposables.push(
        // Register URI Handler (e.g. vscode://sourcegraph.cody-ai)
        vscode.window.registerUriHandler({
            handleUri: async (uri: vscode.Uri) => {
                if (uri.path === '/app-done') {
                    // This is an old re-entrypoint from App that is a no-op now.
                } else {
                    void tokenCallbackHandler(uri)
                }
            },
        })
    )
}
