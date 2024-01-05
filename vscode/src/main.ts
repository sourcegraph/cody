import * as vscode from 'vscode'

import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { ChatEventSource } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { FixupIntent } from '@sourcegraph/cody-shared/src/editor'
import { FeatureFlag, featureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'
import { newPromptMixin, PromptMixin } from '@sourcegraph/cody-shared/src/prompt/prompt-mixin'
import { isDotCom } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'
import { graphqlClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql'

import { CachedRemoteEmbeddingsClient } from './chat/CachedRemoteEmbeddingsClient'
import { ChatManager, CodyChatPanelViewType } from './chat/chat-view/ChatManager'
import { ContextProvider } from './chat/ContextProvider'
import { FixupManager } from './chat/FixupViewProvider'
import { MessageProviderOptions } from './chat/MessageProvider'
import {
    ACCOUNT_LIMITS_INFO_URL,
    ACCOUNT_UPGRADE_URL,
    ACCOUNT_USAGE_URL,
    AuthStatus,
    CODY_FEEDBACK_URL,
} from './chat/protocol'
import { CodeActionProvider } from './code-actions/CodeActionProvider'
import { createInlineCompletionItemProvider } from './completions/create-inline-completion-item-provider'
import { getConfiguration, getFullConfig } from './configuration'
import { ExecuteEditArguments } from './edit/execute'
import { getEditor } from './editor/active-editor'
import { VSCodeEditor } from './editor/vscode-editor'
import { PlatformContext } from './extension.common'
import { configureExternalServices } from './external-services'
import { logDebug } from './log'
import { FixupController } from './non-stop/FixupController'
import { showSetupNotification } from './notifications/setup-notification'
import { gitAPIinit } from './repository/repositoryHelpers'
import { SearchViewProvider } from './search/SearchViewProvider'
import { AuthProvider } from './services/AuthProvider'
import { showFeedbackSupportQuickPick } from './services/FeedbackOptions'
import { GuardrailsProvider } from './services/GuardrailsProvider'
import { localStorage } from './services/LocalStorageProvider'
import * as OnboardingExperiment from './services/OnboardingExperiment'
import { getAccessToken, secretStorage, VSCodeSecretStorage } from './services/SecretStorageProvider'
import { createStatusBar } from './services/StatusBar'
import { createOrUpdateEventLogger, telemetryService } from './services/telemetry'
import { createOrUpdateTelemetryRecorderProvider, telemetryRecorder } from './services/telemetry-v2'
import { onTextDocumentChange } from './services/utils/codeblock-action-tracker'
import { workspaceActionsOnConfigChange } from './services/utils/workspace-action'
import { TestSupport } from './test-support'
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

    // Set codyignore list on git extension startup
    const gitAPI = await gitAPIinit()
    if (gitAPI) {
        disposables.push(gitAPI)
    }

    const isExtensionModeDevOrTest =
        context.extensionMode === vscode.ExtensionMode.Development ||
        context.extensionMode === vscode.ExtensionMode.Test
    await configureEventsInfra(initialConfig, isExtensionModeDevOrTest)

    // Controller for Non-Stop Cody
    const fixup = new FixupController()
    disposables.push(fixup)
    if (TestSupport.instance) {
        TestSupport.instance.fixupController.set(fixup)
    }

    const editor = new VSCodeEditor({
        fixups: fixup,
        command: platform.createCommandsController?.(context),
    })

    // Could we use the `initialConfig` instead?
    const workspaceConfig = vscode.workspace.getConfiguration()
    const config = getConfiguration(workspaceConfig)

    if (config.chatPreInstruction) {
        PromptMixin.addCustom(newPromptMixin(config.chatPreInstruction))
    }

    if (config.autocompleteExperimentalSyntacticPostProcessing) {
        parseAllVisibleDocuments()

        disposables.push(vscode.window.onDidChangeVisibleTextEditors(parseAllVisibleDocuments))
        disposables.push(vscode.workspace.onDidChangeTextDocument(updateParseTreeOnEdit))
    }

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

    const symfRunner = platform.createSymfRunner?.(context, initialConfig.serverEndpoint, initialConfig.accessToken)
    if (symfRunner) {
        disposables.push(symfRunner)
    }

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
    } = await configureExternalServices(initialConfig, rgPath, symfRunner, editor, platform)

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

    const fixupManager = new FixupManager(messageProviderOptions)

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
    authProvider.addChangeListener(async (authStatus: AuthStatus) => {
        // Update context provider first since it will also update the configuration
        await contextProvider.syncAuthStatus()

        featureFlagProvider.syncAuthStatus()
        await chatManager.syncAuthStatus(authStatus)

        if (symfRunner && authStatus.isLoggedIn) {
            getAccessToken()
                .then(token => {
                    symfRunner.setSourcegraphAuth(authStatus.endpoint, token)
                })
                .catch(() => {})
            workspaceActionsOnConfigChange(editor.getWorkspaceRootUri(), authStatus.endpoint)
        } else {
            symfRunner?.setSourcegraphAuth(null, null)
        }

        setupAutocomplete()
    })
    // Sync initial auth status
    await chatManager.syncAuthStatus(authProvider.getAuthStatus())

    const executeRecipeInChatView = async (
        recipe: RecipeID,
        openChatView = true,
        humanInput = '',
        source: ChatEventSource = 'editor'
    ): Promise<void> => {
        await chatManager.executeRecipe(recipe, humanInput, openChatView, source)
    }

    const executeFixup = async (
        args: ExecuteEditArguments = {},
        source: ChatEventSource = 'editor' // where the command was triggered from
    ): Promise<void> => {
        const commandEventName = source === 'doc' ? 'doc' : 'edit'
        telemetryService.log(
            `CodyVSCodeExtension:command:${commandEventName}:executed`,
            { source },
            { hasV2Event: true }
        )
        telemetryRecorder.recordEvent(`cody.command.${commandEventName}`, 'executed', { privateMetadata: { source } })
        const editor = getEditor()
        if (editor.ignored) {
            console.error('File was ignored by Cody.')
            return
        }
        const document = args.document || editor.active?.document
        if (!document) {
            void vscode.window.showErrorMessage('Please open a file before running a command.')
            return
        }

        const range = args.range || editor.active?.selection
        if (!range) {
            return
        }

        const task = args.instruction?.trim()
            ? await fixup.createTask(document.uri, args.instruction, range, args.intent, args.insertMode, source)
            : await fixup.promptUserForTask(args, source)
        if (!task) {
            return
        }

        const provider = fixupManager.getProviderForTask(task)
        return provider.startFix()
    }

    const statusBar = createStatusBar()

    disposables.push(
        vscode.commands.registerCommand(
            'cody.command.edit-code',
            (
                args: {
                    range?: vscode.Range
                    instruction?: string
                    intent?: FixupIntent
                    document?: vscode.TextDocument
                    insertMode?: boolean
                },
                source?: ChatEventSource
            ) => executeFixup(args, source)
        ),
        // Tests
        // Access token - this is only used in configuration tests
        vscode.commands.registerCommand('cody.test.token', async (url, token) => authProvider.auth(url, token)),
        // Auth
        vscode.commands.registerCommand('cody.auth.signin', () => authProvider.signinMenu()),
        vscode.commands.registerCommand('cody.auth.signout', () => authProvider.signoutMenu()),
        vscode.commands.registerCommand('cody.auth.account', () => authProvider.accountMenu()),
        vscode.commands.registerCommand('cody.auth.support', () => showFeedbackSupportQuickPick()),
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
        vscode.commands.registerCommand('cody.action.chat', async (input: string, source?: ChatEventSource) => {
            await executeRecipeInChatView('chat-question', true, input, source)
        }),
        vscode.commands.registerCommand('cody.action.commands.menu', async () => {
            await editor.controllers.command?.menu('default')
        }),
        vscode.commands.registerCommand(
            'cody.action.commands.custom.menu',
            () => editor.controllers.command?.menu('custom')
        ),
        vscode.commands.registerCommand('cody.settings.commands', () => editor.controllers.command?.menu('config')),
        vscode.commands.registerCommand('cody.action.commands.exec', async title => {
            await chatManager.executeCustomCommand(title)
        }),
        vscode.commands.registerCommand('cody.command.explain-code', async () => {
            await executeRecipeInChatView('custom-prompt', true, '/explain')
        }),
        vscode.commands.registerCommand('cody.command.generate-tests', async () => {
            await executeRecipeInChatView('custom-prompt', true, '/test')
        }),
        vscode.commands.registerCommand('cody.command.document-code', async () => {
            await executeRecipeInChatView('custom-prompt', false, '/doc')
        }),
        vscode.commands.registerCommand('cody.command.smell-code', async () => {
            await executeRecipeInChatView('custom-prompt', true, '/smell')
        }),
        vscode.commands.registerCommand('cody.command.context-search', () =>
            executeRecipeInChatView('context-search', true)
        ),

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
                title: 'Sign In To Use Cody',
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

    vscode.window.onDidChangeWindowState(async ws => {
        const endpoint = authProvider.getAuthStatus().endpoint
        if (ws.focused && endpoint && isDotCom(endpoint)) {
            const res = await graphqlClient.getDotComCurrentUserInfo()
            if (res instanceof Error) {
                console.error(res)
                return
            }

            const authStatus = authProvider.getAuthStatus()

            authStatus.hasVerifiedEmail = res.hasVerifiedEmail
            authStatus.userCanUpgrade = !res.codyProEnabled
            authStatus.primaryEmail = res.primaryEmail.email
            authStatus.displayName = res.displayName
            authStatus.avatarURL = res.avatarURL

            void chatManager.syncAuthStatus(authStatus)
        }
    })

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
                    triggerNotice: notice => chatManager.triggerNotice(notice),
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

    // Clean up old onboarding experiment state
    void OnboardingExperiment.cleanUpCachedSelection()

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
