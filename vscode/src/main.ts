import * as vscode from 'vscode'

import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { CodebaseContext } from '@sourcegraph/cody-shared/src/codebase-context'
import { CodyCompletionItemProvider } from '@sourcegraph/cody-shared/src/completions'
import { CompletionsCache } from '@sourcegraph/cody-shared/src/completions/cache'
import { CompletionsDocumentProvider } from '@sourcegraph/cody-shared/src/completions/docprovider'
import { History } from '@sourcegraph/cody-shared/src/completions/history'
import * as CompletionsLogger from '@sourcegraph/cody-shared/src/completions/logger'
import { createProviderConfig } from '@sourcegraph/cody-shared/src/completions/providers/createProvider'
import { registerAutocompleteTraceView } from '@sourcegraph/cody-shared/src/completions/tracer/traceView'
import { Configuration, ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { setIDE } from '@sourcegraph/cody-shared/src/ide'
import { SourcegraphNodeCompletionsClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/nodeClient'

import { ChatViewProvider } from './chat/ChatViewProvider'
import { ContextProvider } from './chat/ContextProvider'
import { InlineChatViewManager } from './chat/InlineChatViewProvider'
import { MessageProviderOptions } from './chat/MessageProvider'
import { CODY_FEEDBACK_URL } from './chat/protocol'
import { getConfiguration, getFullConfig, migrateConfiguration } from './configuration'
import { VSCodeEditor } from './editor/vscode-editor'
import { configureExternalServices } from './external-services'
import { MyPromptController } from './my-cody/MyPromptController'
import { FixupController } from './non-stop/FixupController'
import { showSetupNotification } from './notifications/setup-notification'
import { getRgPath } from './rg'
import { AuthProvider } from './services/AuthProvider'
import { createOrUpdateEventLogger, logEvent } from './services/EventLogger'
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
import { TestSupport } from './test-support'

/**
 * Start the extension, watching all relevant configuration and secrets for changes.
 */
export async function start(context: vscode.ExtensionContext): Promise<vscode.Disposable> {
    await migrateConfiguration()

    const secretStorage =
        process.env.CODY_TESTING === 'true' || process.env.CODY_PROFILE_TEMP === 'true'
            ? new InMemorySecretStorage()
            : new VSCodeSecretStorage(context.secrets)
    const localStorage = new LocalStorage(context.globalState)
    const rgPath = await getRgPath(context.extensionPath)

    const disposables: vscode.Disposable[] = []

    const { disposable, onConfigurationChange } = await register(
        context,
        await getFullConfig(secretStorage, localStorage),
        secretStorage,
        localStorage,
        rgPath
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
    rgPath: string | null
): Promise<{
    disposable: vscode.Disposable
    onConfigurationChange: (newConfig: ConfigurationWithAccessToken) => void
}> => {
    setIDE(vscode)
    const disposables: vscode.Disposable[] = []

    // Controller for Inline Chat
    await createOrUpdateEventLogger(initialConfig, localStorage)
    // Controller for inline Chat
    const commentController = new InlineController(context.extensionPath)
    // Controller for Non-Stop Cody
    const fixup = new FixupController()
    disposables.push(fixup)
    if (TestSupport.instance) {
        TestSupport.instance.fixupController.set(fixup)
    }
    // Controller for Custom Recipes
    const prompt = new MyPromptController(context, initialConfig.experimentalCustomRecipes)

    const editor = new VSCodeEditor({ inline: commentController, fixups: fixup, prompt })
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
    } = await configureExternalServices(initialConfig, rgPath, editor)

    const authProvider = new AuthProvider(initialConfig, secretStorage, localStorage)
    await authProvider.init()

    const contextProvider = new ContextProvider(
        initialConfig,
        chatClient,
        codebaseContext,
        editor,
        secretStorage,
        localStorage,
        rgPath,
        authProvider
    )
    disposables.push(contextProvider)

    // Shared configuration that is required for chat views to send and receive messages
    const messageProviderOptions: MessageProviderOptions = {
        chat: chatClient,
        intentDetector,
        guardrails,
        editor,
        localStorage,
        rgPath,
        authProvider,
        contextProvider,
    }

    const inlineChatManager = new InlineChatViewManager(messageProviderOptions)
    const sidebarChatProvider = new ChatViewProvider({
        ...messageProviderOptions,
        extensionPath: context.extensionPath,
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
            createOrUpdateEventLogger(newConfig, localStorage).catch(error => console.error(error))
        })
    )

    const executeRecipeInSidebar = async (recipe: RecipeID, openChatView = true): Promise<void> => {
        if (openChatView) {
            sidebarChatProvider.showTab('chat')
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

    const statusBar = createStatusBar()

    disposables.push(
        // Inline Chat Provider
        vscode.commands.registerCommand('cody.comment.add', async (comment: vscode.CommentReply) => {
            const isFixMode = /^\/f(ix)?\s/i.test(comment.text.trimStart())
            const inlineChatProvider = inlineChatManager.getProviderForThread(comment.thread)
            await inlineChatProvider.addChat(comment.text, isFixMode)
            logEvent(`CodyVSCodeExtension:inline-assist:${isFixMode ? 'fixup' : 'chat'}`)
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
            sidebarChatProvider.setWebviewView('chat')
            await vscode.commands.executeCommand('cody.chat.focus')
            // Remove the inline chat
            inlineChatManager.removeProviderForThread(thread)
        }),
        vscode.commands.registerCommand('cody.inline.new', () =>
            vscode.commands.executeCommand('workbench.action.addComment')
        ),
        // Tests
        // Access token - this is only used in configuration tests
        vscode.commands.registerCommand('cody.test.token', async (args: any[]) => {
            if (args?.length && (args[0] as string)) {
                await secretStorage.store(CODY_ACCESS_TOKEN_SECRET, args[0])
            }
        }),
        // Auth
        vscode.commands.registerCommand('cody.auth.signin', () => authProvider.signinMenu()),
        vscode.commands.registerCommand('cody.auth.signout', () => authProvider.signoutMenu()),
        vscode.commands.registerCommand('cody.auth.support', () => showFeedbackSupportQuickPick()),
        // Commands
        vscode.commands.registerCommand('cody.interactive.clear', async () => {
            await sidebarChatProvider.clearAndRestartSession()
            sidebarChatProvider.setWebviewView('chat')
        }),
        vscode.commands.registerCommand('cody.focus', () => vscode.commands.executeCommand('cody.chat.focus')),
        vscode.commands.registerCommand('cody.settings.extension', () =>
            vscode.commands.executeCommand('workbench.action.openSettings', { query: '@ext:sourcegraph.cody-ai' })
        ),
        vscode.commands.registerCommand('cody.history', () => sidebarChatProvider.setWebviewView('history')),
        vscode.commands.registerCommand('cody.history.clear', async () => {
            await sidebarChatProvider.clearHistory()
        }),
        // Recipes
        vscode.commands.registerCommand('cody.customRecipes.exec', async title => {
            if (!sidebarChatProvider.isCustomRecipeAction(title)) {
                sidebarChatProvider.showTab('chat')
            }
            await sidebarChatProvider.executeCustomRecipe(title)
        }),
        vscode.commands.registerCommand('cody.customRecipes.list', () => prompt.quickRecipe()),
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
            void createOrUpdateEventLogger(newConfig, localStorage)
        },
    }
}

function createCompletionsProvider(
    config: Configuration,
    webviewErrorMessenger: (error: string) => Promise<void>,
    completionsClient: SourcegraphNodeCompletionsClient,
    statusBar: CodyStatusBar,
    codebaseContext: CodebaseContext
): vscode.Disposable {
    const disposables: vscode.Disposable[] = []

    const documentProvider = new CompletionsDocumentProvider()
    disposables.push(vscode.workspace.registerTextDocumentContentProvider('cody', documentProvider))

    const history = new History()
    const providerConfig = createProviderConfig(config, webviewErrorMessenger, completionsClient)
    const completionsProvider = new CodyCompletionItemProvider({
        providerConfig,
        history,
        statusBar,
        codebaseContext,
        cache: config.autocompleteAdvancedCache ? new CompletionsCache() : null,
        isEmbeddingsContextEnabled: config.autocompleteAdvancedEmbeddings,
        triggerMoreEagerly: config.autocompleteExperimentalTriggerMoreEagerly,
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
