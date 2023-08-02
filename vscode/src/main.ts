import * as vscode from 'vscode'

import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { CodebaseContext } from '@sourcegraph/cody-shared/src/codebase-context'
import { Configuration, ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { SourcegraphCompletionsClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/client'

import { ChatViewProvider } from './chat/ChatViewProvider'
import { ContextProvider } from './chat/ContextProvider'
import { FixupManager } from './chat/FixupViewProvider'
import { InlineChatViewManager } from './chat/InlineChatViewProvider'
import { MessageProviderOptions } from './chat/MessageProvider'
import { CODY_FEEDBACK_URL } from './chat/protocol'
import { CompletionsCache } from './completions/cache'
import { VSCodeDocumentHistory } from './completions/history'
import * as CompletionsLogger from './completions/logger'
import { createProviderConfig } from './completions/providers/createProvider'
import { registerAutocompleteTraceView } from './completions/tracer/traceView'
import { InlineCompletionItemProvider } from './completions/vscodeInlineCompletionItemProvider'
import { getConfiguration, getFullConfig } from './configuration'
import { VSCodeEditor } from './editor/vscode-editor'
import { PlatformContext } from './extension.common'
import { configureExternalServices } from './external-services'
import { FixupController } from './non-stop/FixupController'
import { showSetupNotification } from './notifications/setup-notification'
import { AuthProvider } from './services/AuthProvider'
import { createOrUpdateEventLogger } from './services/EventLogger'
import { showFeedbackSupportQuickPick } from './services/FeedbackOptions'
import { GuardrailsProvider } from './services/GuardrailsProvider'
import { Comment, InlineController } from './services/InlineController'
import { LocalStorage } from './services/LocalStorageProvider'
import {
    CODY_ACCESS_TOKEN_SECRET,
    InMemorySecretStorage,
    SecretStorage,
    VSCodeSecretStorage,
} from './services/SecretStorageProvider'
import { CodyStatusBar, createStatusBar } from './services/StatusBar'
import { createVSCodeTelemetryService } from './services/telemetry'
import { TestSupport } from './test-support'

/**
 * Start the extension, watching all relevant configuration and secrets for changes.
 */
export async function start(context: vscode.ExtensionContext, platform: PlatformContext): Promise<vscode.Disposable> {
    const secretStorage =
        process.env.CODY_TESTING === 'true' || process.env.CODY_PROFILE_TEMP === 'true'
            ? new InMemorySecretStorage()
            : new VSCodeSecretStorage(context.secrets)
    const localStorage = new LocalStorage(context.globalState)
    const rgPath = platform.getRgPath ? await platform.getRgPath() : null

    const disposables: vscode.Disposable[] = []

    const { disposable, onConfigurationChange } = await register(
        context,
        await getFullConfig(secretStorage, localStorage),
        secretStorage,
        localStorage,
        rgPath,
        platform
    )
    disposables.push(disposable)

    // Re-initialize when configuration
    disposables.push(
        vscode.workspace.onDidChangeConfiguration(async event => {
            if (event.affectsConfiguration('cody')) {
                onConfigurationChange(await getFullConfig(secretStorage, localStorage))
            }
        })
    )

    return vscode.Disposable.from(...disposables)
}

// Registers commands and webview given the config.
const register = async (
    context: vscode.ExtensionContext,
    initialConfig: ConfigurationWithAccessToken,
    secretStorage: SecretStorage,
    localStorage: LocalStorage,
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
    await createOrUpdateEventLogger(initialConfig, localStorage, isExtensionModeDevOrTest)
    const telemetryService = createVSCodeTelemetryService()

    // Controller for inline Chat
    const commentController = new InlineController(context.extensionPath, telemetryService)
    // Controller for Non-Stop Cody
    const fixup = new FixupController()
    disposables.push(fixup)
    if (TestSupport.instance) {
        TestSupport.instance.fixupController.set(fixup)
    }

    const editor = new VSCodeEditor({
        inline: commentController,
        fixups: fixup,
        prompt: platform.createMyPromptController?.(context, initialConfig.experimentalCustomRecipes),
    })

    // Could we use the `initialConfig` instead?
    const workspaceConfig = vscode.workspace.getConfiguration()
    const config = getConfiguration(workspaceConfig)

    const {
        intentDetector,
        codebaseContext,
        chatClient,
        completionsClient,
        guardrails,
        onConfigurationChange: externalServicesOnDidConfigurationChange,
    } = await configureExternalServices(initialConfig, rgPath, editor, telemetryService, platform)

    const authProvider = new AuthProvider(initialConfig, secretStorage, localStorage, telemetryService)
    await authProvider.init()

    const contextProvider = new ContextProvider(
        initialConfig,
        chatClient,
        codebaseContext,
        editor,
        secretStorage,
        localStorage,
        rgPath,
        authProvider,
        telemetryService,
        platform
    )
    disposables.push(contextProvider)

    // Shared configuration that is required for chat views to send and receive messages
    const messageProviderOptions: MessageProviderOptions = {
        chat: chatClient,
        intentDetector,
        guardrails,
        editor,
        localStorage,
        authProvider,
        contextProvider,
        telemetryService,
        platform,
    }

    const inlineChatManager = new InlineChatViewManager(messageProviderOptions)
    const fixupManager = new FixupManager(messageProviderOptions)
    const sidebarChatProvider = new ChatViewProvider({
        ...messageProviderOptions,
        extensionUri: context.extensionUri,
    })

    disposables.push(sidebarChatProvider)
    fixup.recipeRunner = sidebarChatProvider

    disposables.push(
        vscode.window.registerWebviewViewProvider('cody.chat', sidebarChatProvider, {
            webviewOptions: { retainContextWhenHidden: true },
        }),
        // Update external services when configurationChangeEvent is fired by chatProvider
        contextProvider.configurationChangeEvent.event(async () => {
            const newConfig = await getFullConfig(secretStorage, localStorage)
            externalServicesOnDidConfigurationChange(newConfig)
            await createOrUpdateEventLogger(newConfig, localStorage, isExtensionModeDevOrTest)
        })
    )

    const executeRecipeInSidebar = async (recipe: RecipeID, openChatView = true): Promise<void> => {
        if (openChatView) {
            await sidebarChatProvider.setWebviewView('chat')
        }
        await sidebarChatProvider.executeRecipe(recipe, '')
    }

    const webviewErrorMessenger = async (error: string): Promise<void> => {
        if (error.includes('rate limit')) {
            const currentTime: number = Date.now()
            const userPref = localStorage.get('rateLimitError')
            // 21600000 is 6h in ms. ex 6 * 60 * 60 * 1000
            if (!userPref || userPref !== 'never' || currentTime - 21600000 >= parseInt(userPref, 10)) {
                const input = await vscode.window.showErrorMessage(error, 'Do not show again', 'Close')
                switch (input) {
                    case 'Do not show again':
                        await localStorage.set('rateLimitError', 'never')
                        break
                    default:
                        // Save current time as a reminder stamp in 6 hours
                        await localStorage.set('rateLimitError', currentTime.toString())
                }
            }
        }
        sidebarChatProvider.handleError(error)
    }

    const executeFixup = async (
        document: vscode.TextDocument,
        instruction: string,
        range: vscode.Range,
        fast: boolean
    ): Promise<void> => {
        const task = fixup.createTask(document.uri, instruction, range, fast ? 'Fast Model' : 'Chat Model')
        const provider = fixupManager.getProviderForTask(task)
        return provider.startFix({ fast })
    }

    const statusBar = createStatusBar()

    disposables.push(
        // Inline Chat Provider
        vscode.commands.registerCommand('cody.comment.add', async (comment: vscode.CommentReply) => {
            // const isFixMode = /^\/f(ix)?\s/i.test(comment.text.trimStart())

            // TODO: Make fix mode the default?
            // if (isFixMode) {
            telemetryService.log('CodyVSCodeExtension:fixup')
            void vscode.commands.executeCommand('workbench.action.collapseAllComments')
            const activeDocument = await vscode.workspace.openTextDocument(comment.thread.uri)
            // TODO: If in fix mode do we need to trim the start?
            return executeFixup(activeDocument, comment.text, comment.thread.range, false)
            // }

            // const inlineChatProvider = inlineChatManager.getProviderForThread(comment.thread)
            // await inlineChatProvider.addChat(comment.text, isFixMode)
            // telemetryService.log(`CodyVSCodeExtension:inline-assist:${isFixMode ? 'fixup' : 'chat'}`)
        }),
        vscode.commands.registerCommand('cody.comment.delete', (thread: vscode.CommentThread) => {
            inlineChatManager.removeProviderForThread(thread)
        }),
        vscode.commands.registerCommand('cody.comment.stop', async (comment: Comment) => {
            const inlineChatProvider = inlineChatManager.getProviderForThread(comment.parent)
            await inlineChatProvider.abortChat()
        }),
        vscode.commands.registerCommand('cody.comment.collapse-all', () =>
            vscode.commands.executeCommand('workbench.action.collapseAllComments')
        ),
        vscode.commands.registerCommand('cody.comment.open-in-sidebar', async (thread: vscode.CommentThread) => {
            const inlineChatProvider = inlineChatManager.getProviderForThread(thread)
            // The inline chat is already saved in history, we just need to tell the sidebar chat to restore it
            await sidebarChatProvider.restoreSession(inlineChatProvider.currentChatID)
            // Ensure that the sidebar view is open if not already
            await sidebarChatProvider.setWebviewView('chat')
            // Remove the inline chat
            inlineChatManager.removeProviderForThread(thread)
        }),
        vscode.commands.registerCommand('cody.inline.new', () =>
            vscode.commands.executeCommand('workbench.action.addComment')
        ),
        vscode.commands.registerCommand('cody.fixup.new', (instruction: string, range: vscode.Range): void => {
            if (vscode.window.activeTextEditor) {
                void executeFixup(vscode.window.activeTextEditor.document, instruction, range, false)
            }
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
        // Commands
        vscode.commands.registerCommand('cody.interactive.clear', async () => {
            await sidebarChatProvider.clearAndRestartSession()
            await sidebarChatProvider.setWebviewView('chat')
        }),
        vscode.commands.registerCommand('cody.focus', () => vscode.commands.executeCommand('cody.chat.focus')),
        vscode.commands.registerCommand('cody.settings.extension', () =>
            vscode.commands.executeCommand('workbench.action.openSettings', { query: '@ext:sourcegraph.cody-ai' })
        ),
        vscode.commands.registerCommand('cody.history', async () => sidebarChatProvider.setWebviewView('history')),
        vscode.commands.registerCommand('cody.history.clear', async () => {
            await sidebarChatProvider.clearHistory()
        }),
        // Recipes
        vscode.commands.registerCommand('cody.customRecipes.exec', async title => {
            if (!sidebarChatProvider.isCustomRecipeAction(title)) {
                await sidebarChatProvider.setWebviewView('chat')
            }
            await sidebarChatProvider.executeCustomRecipe(title)
        }),
        vscode.commands.registerCommand('cody.customRecipes.list', () => editor.controllers.prompt?.quickRecipe()),
        vscode.commands.registerCommand('cody.recipe.explain-code', () =>
            executeRecipeInSidebar('explain-code-detailed')
        ),
        vscode.commands.registerCommand('cody.recipe.explain-code-high-level', () =>
            executeRecipeInSidebar('explain-code-high-level')
        ),
        vscode.commands.registerCommand('cody.recipe.generate-unit-test', () =>
            executeRecipeInSidebar('generate-unit-test')
        ),
        vscode.commands.registerCommand('cody.recipe.generate-docstring', () =>
            executeRecipeInSidebar('generate-docstring')
        ),
        vscode.commands.registerCommand('cody.recipe.fixup', () => executeRecipeInSidebar('fixup')),
        vscode.commands.registerCommand('cody.recipe.translate-to-language', () =>
            executeRecipeInSidebar('translate-to-language')
        ),
        vscode.commands.registerCommand('cody.recipe.git-history', () => executeRecipeInSidebar('git-history')),
        vscode.commands.registerCommand('cody.recipe.improve-variable-names', () =>
            executeRecipeInSidebar('improve-variable-names')
        ),
        vscode.commands.registerCommand('cody.recipe.inline-touch', () =>
            executeRecipeInSidebar('inline-touch', false)
        ),
        vscode.commands.registerCommand('cody.recipe.find-code-smells', () =>
            executeRecipeInSidebar('find-code-smells')
        ),
        vscode.commands.registerCommand('cody.recipe.context-search', () => executeRecipeInSidebar('context-search')),

        // Register URI Handler (vscode://sourcegraph.cody-ai)
        vscode.window.registerUriHandler({
            handleUri: async (uri: vscode.Uri) => {
                await authProvider.tokenCallbackHandler(uri, config.customHeaders)
            },
        }),
        statusBar,
        // Walkthrough / Support
        vscode.commands.registerCommand('cody.feedback', () =>
            vscode.env.openExternal(vscode.Uri.parse(CODY_FEEDBACK_URL.href))
        ),
        vscode.commands.registerCommand('cody.welcome', async () => {
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
        vscode.commands.registerCommand('cody.walkthrough.showFixup', () =>
            sidebarChatProvider.setWebviewView('recipes')
        ),
        vscode.commands.registerCommand('cody.walkthrough.showExplain', () =>
            sidebarChatProvider.setWebviewView('recipes')
        ),
        vscode.commands.registerCommand('cody.walkthrough.enableInlineChat', async () => {
            await workspaceConfig.update('cody.inlineChat', true, vscode.ConfigurationTarget.Global)
            // Open VSCode setting view. Provides visual confirmation that the setting is enabled.
            return vscode.commands.executeCommand('workbench.action.openSettings', {
                query: 'cody.inlineChat.enabled',
                openToSide: true,
            })
        })
    )

    let completionsProvider: vscode.Disposable | null = null
    if (initialConfig.autocomplete) {
        completionsProvider = createCompletionsProvider(
            config,
            webviewErrorMessenger,
            completionsClient,
            statusBar,
            codebaseContext
        )
    }

    // Create a disposable to clean up completions when the extension reloads.
    const disposeCompletions: vscode.Disposable = {
        dispose: () => {
            completionsProvider?.dispose()
        },
    }
    disposables.push(disposeCompletions)

    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('cody.autocomplete')) {
            const config = getConfiguration(vscode.workspace.getConfiguration())

            if (!config.autocomplete) {
                completionsProvider?.dispose()
                completionsProvider = null
                return
            }

            if (completionsProvider !== null) {
                // If completions are already initialized and still enabled, we
                // need to reset the completion provider.
                completionsProvider.dispose()
            }
            completionsProvider = createCompletionsProvider(
                config,
                webviewErrorMessenger,
                completionsClient,
                statusBar,
                codebaseContext
            )
        }
    })

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
    // Register task view and non-stop cody command when feature flag is on
    if (initialConfig.experimentalNonStop || process.env.CODY_TESTING === 'true') {
        fixup.register()
        await vscode.commands.executeCommand('setContext', 'cody.nonstop.fixups.enabled', true)
    }

    await showSetupNotification(initialConfig, localStorage)
    return {
        disposable: vscode.Disposable.from(...disposables),
        onConfigurationChange: newConfig => {
            contextProvider.onConfigurationChange(newConfig)
            externalServicesOnDidConfigurationChange(newConfig)
            void createOrUpdateEventLogger(newConfig, localStorage, isExtensionModeDevOrTest)
        },
    }
}

function createCompletionsProvider(
    config: Configuration,
    webviewErrorMessenger: (error: string) => Promise<void>,
    completionsClient: SourcegraphCompletionsClient,
    statusBar: CodyStatusBar,
    codebaseContext: CodebaseContext
): vscode.Disposable {
    const disposables: vscode.Disposable[] = []

    const history = new VSCodeDocumentHistory()
    const providerConfig = createProviderConfig(config, webviewErrorMessenger, completionsClient)
    const completionsProvider = new InlineCompletionItemProvider({
        providerConfig,
        history,
        statusBar,
        codebaseContext,
        cache: config.autocompleteAdvancedCache ? new CompletionsCache() : null,
        isEmbeddingsContextEnabled: config.autocompleteAdvancedEmbeddings,
        completeSuggestWidgetSelection: config.autocompleteExperimentalCompleteSuggestWidgetSelection,
    })

    disposables.push(
        vscode.commands.registerCommand('cody.autocomplete.inline.accepted', ({ codyLogId, codyLines }) => {
            CompletionsLogger.accept(codyLogId, codyLines)
        }),
        vscode.languages.registerInlineCompletionItemProvider('*', completionsProvider),
        registerAutocompleteTraceView(completionsProvider)
    )
    return {
        dispose: () => {
            for (const disposable of disposables) {
                disposable.dispose()
            }
        },
    }
}
