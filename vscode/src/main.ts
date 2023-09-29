import * as vscode from 'vscode'

import { commandRegex } from '@sourcegraph/cody-shared/src/chat/recipes/helpers'
import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { newPromptMixin, PromptMixin } from '@sourcegraph/cody-shared/src/prompt/prompt-mixin'

import { ChatViewProvider } from './chat/ChatViewProvider'
import { ContextProvider } from './chat/ContextProvider'
import { FixupManager } from './chat/FixupViewProvider'
import { InlineChatViewManager } from './chat/InlineChatViewProvider'
import { MessageProviderOptions } from './chat/MessageProvider'
import { AuthStatus, CODY_FEEDBACK_URL } from './chat/protocol'
import { createInlineCompletionItemProvider } from './completions/create-inline-completion-item-provider'
import { parseAllVisibleDocuments, updateParseTreeOnEdit } from './completions/tree-sitter/parse-tree-cache'
import { getConfiguration, getFullConfig } from './configuration'
import { VSCodeEditor } from './editor/vscode-editor'
import { PlatformContext } from './extension.common'
import { configureExternalServices } from './external-services'
import { FixupController } from './non-stop/FixupController'
import { showSetupNotification } from './notifications/setup-notification'
import { AuthProvider } from './services/AuthProvider'
import { showFeedbackSupportQuickPick } from './services/FeedbackOptions'
import { GuardrailsProvider } from './services/GuardrailsProvider'
import { Comment, InlineController } from './services/InlineController'
import { LocalAppSetupPublisher } from './services/LocalAppSetupPublisher'
import { localStorage } from './services/LocalStorageProvider'
import {
    CODY_ACCESS_TOKEN_SECRET,
    getAccessToken,
    secretStorage,
    VSCodeSecretStorage,
} from './services/SecretStorageProvider'
import { createStatusBar } from './services/StatusBar'
import { createOrUpdateEventLogger, telemetryService } from './services/telemetry'
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
    await createOrUpdateEventLogger(initialConfig, isExtensionModeDevOrTest)

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

    const symfRunner = platform.createSymfRunner?.(context, initialConfig.accessToken)
    if (symfRunner) {
        authProvider.addChangeListener(async (authStatus: AuthStatus) => {
            if (authStatus.isLoggedIn) {
                symfRunner.setAuthToken(await getAccessToken())
            } else {
                symfRunner.setAuthToken(null)
            }
        })
    }

    const {
        featureFlagProvider,
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
    const sidebarChatProvider = new ChatViewProvider({
        ...messageProviderOptions,
        extensionUri: context.extensionUri,
    })

    disposables.push(sidebarChatProvider)

    disposables.push(
        vscode.window.registerWebviewViewProvider('cody.chat', sidebarChatProvider, {
            webviewOptions: { retainContextWhenHidden: true },
        }),
        // Update external services when configurationChangeEvent is fired by chatProvider
        contextProvider.configurationChangeEvent.event(async () => {
            const newConfig = await getFullConfig()
            externalServicesOnDidConfigurationChange(newConfig)
            await createOrUpdateEventLogger(newConfig, isExtensionModeDevOrTest)
        })
    )

    const executeRecipeInSidebar = async (
        recipe: RecipeID,
        openChatView = true,
        humanInput?: string
    ): Promise<void> => {
        if (openChatView) {
            await sidebarChatProvider.setWebviewView('chat')
        }

        await sidebarChatProvider.executeRecipe(recipe, humanInput)
    }

    const executeFixup = async (
        args: {
            document?: vscode.TextDocument
            instruction?: string
            range?: vscode.Range
            auto?: boolean
            insertMode?: boolean
        } = {},
        source = 'editor' // where the command was triggered from
    ): Promise<void> => {
        telemetryService.log('CodyVSCodeExtension:command:edit:executed', { source })
        const document = args.document || vscode.window.activeTextEditor?.document
        if (!document) {
            return
        }

        const range = args.range || vscode.window.activeTextEditor?.selection
        if (!range) {
            return
        }

        const task = args.instruction?.replace('/edit', '').trim()
            ? fixup.createTask(document.uri, args.instruction, range, args.auto, args.insertMode)
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
            telemetryService.log('CodyVSCodeExtension:inline-assist:deleteButton:clicked')
        }),
        vscode.commands.registerCommand('cody.comment.stop', async (comment: Comment) => {
            const inlineChatProvider = inlineChatManager.getProviderForThread(comment.parent)
            await inlineChatProvider.abortChat()
            telemetryService.log('CodyVSCodeExtension:abortButton:clicked', { source: 'inline-chat' })
        }),
        vscode.commands.registerCommand('cody.comment.collapse-all', () => {
            void vscode.commands.executeCommand('workbench.action.collapseAllComments')
            telemetryService.log('CodyVSCodeExtension:inline-assist:collapseButton:clicked')
        }),
        vscode.commands.registerCommand('cody.comment.open-in-sidebar', async (thread: vscode.CommentThread) => {
            const inlineChatProvider = inlineChatManager.getProviderForThread(thread)
            // The inline chat is already saved in history, we just need to tell the sidebar chat to restore it
            await sidebarChatProvider.restoreSession(inlineChatProvider.currentChatID)
            // Ensure that the sidebar view is open if not already
            await sidebarChatProvider.setWebviewView('chat')
            // Remove the inline chat
            inlineChatManager.removeProviderForThread(thread)
            telemetryService.log('CodyVSCodeExtension:inline-assist:openInSidebarButton:clicked')
        }),
        vscode.commands.registerCommand(
            'cody.command.edit-code',
            (
                args: {
                    range?: vscode.Range
                    instruction?: string
                    document?: vscode.TextDocument
                    auto?: boolean
                    insertMode?: boolean
                },
                source?: string
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
        vscode.commands.registerCommand('cody.test.token', async token =>
            secretStorage.store(CODY_ACCESS_TOKEN_SECRET, token)
        ),
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
        vscode.commands.registerCommand('cody.interactive.clear', async () => {
            await sidebarChatProvider.clearAndRestartSession()
            await sidebarChatProvider.setWebviewView('chat')
            telemetryService.log('CodyVSCodeExtension:chatTitleButton:clicked', { name: 'reset' })
        }),
        vscode.commands.registerCommand('cody.focus', () => vscode.commands.executeCommand('cody.chat.focus')),
        vscode.commands.registerCommand('cody.settings.extension', () =>
            vscode.commands.executeCommand('workbench.action.openSettings', { query: '@ext:sourcegraph.cody-ai' })
        ),
        vscode.commands.registerCommand('cody.history', async () => {
            await sidebarChatProvider.setWebviewView('history')
            telemetryService.log('CodyVSCodeExtension:chatTitleButton:clicked', { name: 'history' })
        }),
        vscode.commands.registerCommand('cody.history.clear', async () => {
            await sidebarChatProvider.clearHistory()
        }),
        // Recipes
        vscode.commands.registerCommand('cody.action.chat', async (input: string) => {
            await executeRecipeInSidebar('chat-question', true, input)
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
            if (!sidebarChatProvider.isCustomCommandAction(title)) {
                await sidebarChatProvider.setWebviewView('chat')
            }
            await sidebarChatProvider.executeCustomCommand(title)
        }),
        vscode.commands.registerCommand('cody.command.explain-code', async () => {
            await executeRecipeInSidebar('custom-prompt', true, '/explain')
        }),
        vscode.commands.registerCommand('cody.command.generate-tests', async () => {
            await executeRecipeInSidebar('custom-prompt', true, '/test')
        }),
        vscode.commands.registerCommand('cody.command.document-code', async () => {
            await executeRecipeInSidebar('custom-prompt', false, '/doc')
        }),
        vscode.commands.registerCommand('cody.command.smell-code', async () => {
            await executeRecipeInSidebar('custom-prompt', true, '/smell')
        }),
        vscode.commands.registerCommand('cody.command.inline-touch', () =>
            executeRecipeInSidebar('inline-touch', false)
        ),
        vscode.commands.registerCommand('cody.command.context-search', () => executeRecipeInSidebar('context-search')),

        // Register URI Handler (vscode://sourcegraph.cody-ai)
        vscode.window.registerUriHandler({
            handleUri: async (uri: vscode.Uri) => {
                if (uri.path === '/app-done') {
                    await sidebarChatProvider.simplifiedOnboardingReloadEmbeddingsState()
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
            telemetryService.log('CodyVSCodeExtension:walkthrough:clicked', { page: 'welcome' })
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
        vscode.commands.registerCommand('cody.walkthrough.showChat', () => sidebarChatProvider.setWebviewView('chat')),
        vscode.commands.registerCommand('cody.walkthrough.showFixup', () => sidebarChatProvider.setWebviewView('chat')),
        vscode.commands.registerCommand('cody.walkthrough.showExplain', async () => {
            telemetryService.log('CodyVSCodeExtension:walkthrough:clicked', { page: 'showExplain' })
            await sidebarChatProvider.setWebviewView('chat')
        }),
        vscode.commands.registerCommand('cody.walkthrough.enableInlineChat', async () => {
            telemetryService.log('CodyVSCodeExtension:walkthrough:clicked', { page: 'enableInlineChat' })
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
                    void sidebarChatProvider.setWebviewView('chat')
                },
            })
        }
    }
    authProvider.addChangeListener(() => updateAuthStatusBarIndicator())
    updateAuthStatusBarIndicator()

    let completionsProvider: vscode.Disposable | null = null
    disposables.push({ dispose: () => completionsProvider?.dispose() })
    const setupAutocomplete = async (): Promise<void> => {
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
            contextProvider,
            featureFlagProvider,
            authProvider,
        })
    }
    // Reload autocomplete if either the configuration changes or the auth status is updated
    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('cody.autocomplete')) {
            void setupAutocomplete()
        }
    })
    authProvider.addChangeListener(() => {
        void setupAutocomplete()
    })
    await setupAutocomplete()

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
    return {
        disposable: vscode.Disposable.from(...disposables),
        onConfigurationChange: newConfig => {
            contextProvider.onConfigurationChange(newConfig)
            externalServicesOnDidConfigurationChange(newConfig)
            void createOrUpdateEventLogger(newConfig, isExtensionModeDevOrTest)
            platform.onConfigurationChange?.(newConfig)
            symfRunner?.setAuthToken(newConfig.accessToken)
        },
    }
}
