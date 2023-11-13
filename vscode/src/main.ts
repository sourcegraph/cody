import * as vscode from 'vscode'

import { commandRegex } from '@sourcegraph/cody-shared/src/chat/recipes/helpers'
import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { ChatEventSource } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { FixupIntent } from '@sourcegraph/cody-shared/src/editor'
import { featureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'
import { newPromptMixin, PromptMixin } from '@sourcegraph/cody-shared/src/prompt/prompt-mixin'
import { graphqlClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql'

import { ChatManager } from './chat/chat-view/ChatManager'
import { ContextProvider } from './chat/ContextProvider'
import { FixupManager } from './chat/FixupViewProvider'
import { InlineChatViewManager } from './chat/InlineChatViewProvider'
import { MessageProviderOptions } from './chat/MessageProvider'
import { AuthStatus, CODY_FEEDBACK_URL } from './chat/protocol'
import { createInlineCompletionItemProvider } from './completions/create-inline-completion-item-provider'
import { parseAllVisibleDocuments, updateParseTreeOnEdit } from './completions/tree-sitter/parse-tree-cache'
import { getConfiguration, getFullConfig } from './configuration'
import { getActiveEditor } from './editor/active-editor'
import { VSCodeEditor } from './editor/vscode-editor'
import { PlatformContext } from './extension.common'
import { configureExternalServices } from './external-services'
import { FixupController } from './non-stop/FixupController'
import { showSetupNotification } from './notifications/setup-notification'
import { SearchViewProvider } from './search/SearchViewProvider'
import { AuthProvider } from './services/AuthProvider'
import { showFeedbackSupportQuickPick } from './services/FeedbackOptions'
import { GuardrailsProvider } from './services/GuardrailsProvider'
import { Comment, InlineController } from './services/InlineController'
import { LocalAppSetupPublisher } from './services/LocalAppSetupPublisher'
import { localStorage } from './services/LocalStorageProvider'
import * as OnboardingExperiment from './services/OnboardingExperiment'
import { getAccessToken, secretStorage, VSCodeSecretStorage } from './services/SecretStorageProvider'
import { createStatusBar } from './services/StatusBar'
import { createOrUpdateEventLogger, telemetryService } from './services/telemetry'
import { createOrUpdateTelemetryRecorderProvider, telemetryRecorder } from './services/telemetry-v2'
import { workspaceActionsOnConfigChange } from './services/utils/workspace-action'
import { TestSupport } from './test-support'

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
    const isExtensionModeDevOrTest =
        context.extensionMode === vscode.ExtensionMode.Development ||
        context.extensionMode === vscode.ExtensionMode.Test
    await configureEventsInfra(initialConfig, isExtensionModeDevOrTest)

    // Controller for inline Chat
    const commentController = new InlineController(context.extensionPath)
    // Controller for Non-Stop Cody
    const fixup = new FixupController()
    disposables.push(fixup)
    if (TestSupport.instance) {
        TestSupport.instance.fixupController.set(fixup)
    }

    const editor = new VSCodeEditor({
        inline: commentController,
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

    const authProvider = new AuthProvider(initialConfig)
    await authProvider.init()

    const symfRunner = platform.createSymfRunner?.(context, initialConfig.serverEndpoint, initialConfig.accessToken)

    graphqlClient.onConfigurationChange(initialConfig)
    void featureFlagProvider.syncAuthStatus()

    const {
        intentDetector,
        codebaseContext: initialCodebaseContext,
        chatClient,
        codeCompletionsClient,
        guardrails,
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
        platform
    )
    disposables.push(contextProvider)
    disposables.push(new LocalAppSetupPublisher(contextProvider))
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

    const inlineChatManager = new InlineChatViewManager(messageProviderOptions)
    const fixupManager = new FixupManager(messageProviderOptions)
    const chatManager = new ChatManager({
        ...messageProviderOptions,
        extensionUri: context.extensionUri,
    })

    // Register tree views
    disposables.push(
        chatManager,
        vscode.window.registerWebviewViewProvider('cody.chat', chatManager.sidebarChat, {
            webviewOptions: { retainContextWhenHidden: true },
        }),
        // Update external services when configurationChangeEvent is fired by chatProvider
        contextProvider.configurationChangeEvent.event(async () => {
            const newConfig = await getFullConfig()
            externalServicesOnDidConfigurationChange(newConfig)
            await configureEventsInfra(newConfig, isExtensionModeDevOrTest)
        })
    )

    if (symfRunner) {
        const searchViewProvider = new SearchViewProvider(context.extensionUri, symfRunner)
        searchViewProvider.initialize()
        disposables.push(searchViewProvider)
        disposables.push(
            vscode.window.registerWebviewViewProvider('cody.search', searchViewProvider, {
                webviewOptions: { retainContextWhenHidden: true },
            })
        )
    }

    // Adds a change listener to the auth provider that syncs the auth status
    authProvider.addChangeListener((authStatus: AuthStatus) => {
        void chatManager.syncAuthStatus(authStatus)
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
    })

    const executeRecipeInChatView = async (
        recipe: RecipeID,
        openChatView = true,
        humanInput = '',
        source: ChatEventSource = 'editor'
    ): Promise<void> => {
        await chatManager.executeRecipe(recipe, humanInput, openChatView, source)
    }

    const executeFixup = async (
        args: {
            document?: vscode.TextDocument
            instruction?: string
            intent?: FixupIntent
            range?: vscode.Range
            insertMode?: boolean
        } = {},
        source: ChatEventSource = 'editor' // where the command was triggered from
    ): Promise<void> => {
        telemetryService.log('CodyVSCodeExtension:command:edit:executed', { source }, { hasV2Event: true })
        telemetryRecorder.recordEvent('cody.command.edit', 'executed', { privateMetadata: { source } })
        const document = args.document || getActiveEditor()?.document
        if (!document) {
            return
        }

        const range = args.range || getActiveEditor()?.selection
        if (!range) {
            return
        }

        const task = args.instruction?.trim()
            ? fixup.createTask(document.uri, args.instruction, range, args.intent, args.insertMode, source)
            : await fixup.promptUserForTask()
        if (!task) {
            return
        }

        const provider = fixupManager.getProviderForTask(task)
        return provider.startFix()
    }

    const statusBar = createStatusBar()

    disposables.push(
        // Inline Chat Provider
        vscode.commands.registerCommand('cody.comment.add', async (comment: vscode.CommentReply) => {
            const isEditMode = commandRegex.edit.test(comment.text.trimStart())

            /**
             * TODO: Should we make fix the default for comments?
             * /chat or /ask could trigger a chat
             */
            if (isEditMode) {
                const source = 'inline-chat'
                void vscode.commands.executeCommand('workbench.action.collapseAllComments')
                const activeDocument = await vscode.workspace.openTextDocument(comment.thread.uri)
                return executeFixup(
                    {
                        document: activeDocument,
                        instruction: comment.text.replace(commandRegex.edit, ''),
                        range: comment.thread.range,
                    },
                    source
                )
            }

            const inlineChatProvider = inlineChatManager.getProviderForThread(comment.thread)
            await inlineChatProvider.addChat(comment.text, false)
        }),
        vscode.commands.registerCommand('cody.comment.delete', (thread: vscode.CommentThread) => {
            inlineChatManager.removeProviderForThread(thread)
            telemetryService.log('CodyVSCodeExtension:inline-assist:deleteButton:clicked', undefined, {
                hasV2Event: true,
            })
            telemetryRecorder.recordEvent('cody.comment.delete', 'clicked')
        }),
        vscode.commands.registerCommand('cody.comment.stop', async (comment: Comment) => {
            const inlineChatProvider = inlineChatManager.getProviderForThread(comment.parent)
            await inlineChatProvider.abortChat()
            telemetryService.log(
                'CodyVSCodeExtension:abortButton:clicked',
                { source: 'inline-chat' },
                { hasV2Event: true }
            )
            telemetryRecorder.recordEvent('cody.comment.stop', 'clicked', {
                privateMetadata: { source: 'inline-chat' },
            })
        }),
        vscode.commands.registerCommand('cody.comment.collapse-all', () => {
            void vscode.commands.executeCommand('workbench.action.collapseAllComments')
            telemetryService.log('CodyVSCodeExtension:inline-assist:collapseButton:clicked', undefined, {
                hasV2Event: true,
            })
            telemetryRecorder.recordEvent('cody.comment.collapse-all', 'clicked')
        }),
        vscode.commands.registerCommand('cody.comment.open-in-sidebar', async (thread: vscode.CommentThread) => {
            const inlineChatProvider = inlineChatManager.getProviderForThread(thread)
            // Ensure that the sidebar view is open if not already
            await chatManager.setWebviewView('chat')
            // The inline chat is already saved in history, we just need to tell the sidebar chat to restore it
            await chatManager.restoreSession(inlineChatProvider.sessionID)
            // Remove the inline chat
            inlineChatManager.removeProviderForThread(thread)
            telemetryService.log('CodyVSCodeExtension:inline-assist:openInSidebarButton:clicked', undefined, {
                hasV2Event: true,
            })
            telemetryRecorder.recordEvent('cody.comment.open-in-sidebar', 'clicked')
        }),
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
        vscode.commands.registerCommand('cody.inline.new', async () => {
            // move focus line to the end of the current selection
            await vscode.commands.executeCommand('cursorLineEndSelect')
            await vscode.commands.executeCommand('workbench.action.addComment')
        }),
        vscode.commands.registerCommand('cody.inline.add', async (instruction: string, range: vscode.Range) => {
            const comment = commentController.create(instruction, range)
            if (!comment) {
                return Promise.resolve()
            }
            const inlineChatProvider = inlineChatManager.getProviderForThread(comment.thread)
            void inlineChatProvider.addChat(comment.text, false)
        }),
        // Tests
        // Access token - this is only used in configuration tests
        vscode.commands.registerCommand('cody.test.token', async (url, token) => authProvider.auth(url, token)),
        // Auth
        vscode.commands.registerCommand('cody.auth.signin', () => authProvider.signinMenu()),
        vscode.commands.registerCommand('cody.auth.signout', () => authProvider.signoutMenu()),
        vscode.commands.registerCommand('cody.auth.support', () => showFeedbackSupportQuickPick()),
        vscode.commands.registerCommand('cody.auth.sync', () => {
            const result = contextProvider.syncAuthStatus()
            void featureFlagProvider.syncAuthStatus()
            // Important that we return a promise here to allow `AuthProvider`
            // to `await` on the auth config changes to propagate.
            return result
        }),
        // Commands
        vscode.commands.registerCommand('cody.chat.restart', async () => {
            await chatManager.clearAndRestartSession()
            telemetryService.log('CodyVSCodeExtension:chatTitleButton:clicked', { name: 'clear' }, { hasV2Event: true })
            telemetryRecorder.recordEvent('cody.interactive.clear', 'clicked', { privateMetadata: { name: 'clear' } })
        }),
        // TODO remove cody.interactive.clear when we remove the old chat
        vscode.commands.registerCommand('cody.interactive.clear', async () => {
            await chatManager.clearAndRestartSession()
            await chatManager.setWebviewView('chat')
            telemetryService.log('CodyVSCodeExtension:chatTitleButton:clicked', { name: 'reset' }, { hasV2Event: true })
            telemetryRecorder.recordEvent('cody.interactive.clear', 'clicked', { privateMetadata: { name: 'reset' } })
        }),
        vscode.commands.registerCommand('cody.focus', () => vscode.commands.executeCommand('cody.chat.focus')),
        vscode.commands.registerCommand('cody.settings.extension', () =>
            vscode.commands.executeCommand('workbench.action.openSettings', { query: '@ext:sourcegraph.cody-ai' })
        ),
        vscode.commands.registerCommand('cody.history', async () => {
            await chatManager.setWebviewView('history')
            telemetryService.log(
                'CodyVSCodeExtension:chatTitleButton:clicked',
                { name: 'history' },
                { hasV2Event: true }
            )
            telemetryRecorder.recordEvent('cody.history', 'clicked', { privateMetadata: { name: 'history' } })
        }),
        vscode.commands.registerCommand('cody.history.clear', async () => {
            await chatManager.clearHistory()
        }),
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
        vscode.commands.registerCommand('cody.command.inline-touch', () =>
            executeRecipeInChatView('inline-touch', false)
        ),
        vscode.commands.registerCommand('cody.command.context-search', () =>
            executeRecipeInChatView('context-search', true)
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
        vscode.commands.registerCommand('cody.walkthrough.enableInlineChat', async () => {
            telemetryService.log(
                'CodyVSCodeExtension:walkthrough:clicked',
                { page: 'enableInlineChat' },
                { hasV2Event: true }
            )
            telemetryRecorder.recordEvent('cody.walkthrough.enableInlineChat', 'clicked')
            await workspaceConfig.update('cody.inlineChat', true, vscode.ConfigurationTarget.Global)
            // Open VSCode setting view. Provides visual confirmation that the setting is enabled.
            return vscode.commands.executeCommand('workbench.action.openSettings', {
                query: 'cody.inlineChat.enabled',
                openToSide: true,
            })
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
    const setupAutocomplete = (): void => {
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

    // Reload autocomplete if either the configuration changes or the auth status is updated
    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('cody.autocomplete')) {
            setupAutocomplete()
        }
    })
    authProvider.addChangeListener(() => {
        setupAutocomplete()
    })
    setupAutocomplete()

    // Initiate inline chat when feature flag is on
    if (!initialConfig.inlineChat) {
        commentController.dispose()
    }

    if (initialConfig.experimentalGuardrails) {
        const guardrailsProvider = new GuardrailsProvider(guardrails, editor)
        disposables.push(
            vscode.commands.registerCommand('cody.guardrails.debug', async () => {
                await guardrailsProvider.debugEditorSelection()
            })
        )
    }
    // Register task view when feature flag is on
    // TODO(umpox): We should move the task view to a quick pick before enabling it everywhere.
    // It is too obstructive when it is in the same window as the sidebar chat.
    if (initialConfig.experimentalNonStop || process.env.CODY_TESTING === 'true') {
        fixup.registerTreeView()
        await vscode.commands.executeCommand('setContext', 'cody.nonstop.fixups.enabled', true)
    }

    await showSetupNotification(initialConfig)

    // Clean up old onboarding experiment state
    void OnboardingExperiment.cleanUpCachedSelection()

    return {
        disposable: vscode.Disposable.from(...disposables),
        onConfigurationChange: newConfig => {
            graphqlClient.onConfigurationChange(newConfig)
            contextProvider.onConfigurationChange(newConfig)
            externalServicesOnDidConfigurationChange(newConfig)
            void configureEventsInfra(newConfig, isExtensionModeDevOrTest)
            platform.onConfigurationChange?.(newConfig)
            symfRunner?.setSourcegraphAuth(newConfig.serverEndpoint, newConfig.accessToken)
        },
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
