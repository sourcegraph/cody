import * as uuid from 'uuid'
import * as vscode from 'vscode'

import {
    type AuthStatus,
    CODY_PASSTHROUGH_VSCODE_OPEN_COMMAND_ID,
    type ChatClient,
    DEFAULT_EVENT_SOURCE,
    type Guardrails,
    authStatus,
    currentAuthStatusAuthed,
    distinctUntilChanged,
    editorStateFromPromptString,
    subscriptionDisposable,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'
import { logDebug } from '../../log'
import type { MessageProviderOptions } from '../MessageProvider'

import { map } from 'observable-fns'
import type { URI } from 'vscode-uri'
import type { startTokenReceiver } from '../../auth/token-receiver'
import type { ExecuteChatArguments } from '../../commands/execute/ask'
import { getConfiguration } from '../../configuration'
import type { ExtensionClient } from '../../extension-client'
import { type ChatLocation, localStorage } from '../../services/LocalStorageProvider'
import {
    handleCodeFromInsertAtCursor,
    handleCodeFromSaveToNewFile,
} from '../../services/utils/codeblock-action-tracker'
import type { ChatIntentAPIClient } from '../context/chatIntentAPIClient'
import type { SmartApplyResult } from '../protocol'
import {
    ChatController,
    type ChatSession,
    disposeWebviewViewOrPanel,
    revealWebviewViewOrPanel,
    webviewViewOrPanelOnDidChangeViewState,
    webviewViewOrPanelViewColumn,
} from './ChatController'
import { chatHistory, exportHistory } from './ChatHistoryManager'
import type { ContextRetriever } from './ContextRetriever'

export const CodyChatEditorViewType = 'cody.editorPanel'

interface Options extends MessageProviderOptions {
    extensionUri: vscode.Uri
    startTokenReceiver?: typeof startTokenReceiver
}

export class ChatsController implements vscode.Disposable {
    /**
     * The chat view in the panel (typically in the sidebar). There is only one panel view at any
     * time, and there can be any number of editor views.
     */
    private panel: ChatController

    /**
     * All chat views (panels and editors).
     */
    private views: ChatController[] = []

    /**
     * The last-active chat view.
     */
    private activeView: ChatController | undefined = undefined

    protected disposables: vscode.Disposable[] = []

    constructor(
        private options: Options,
        private chatClient: ChatClient,

        private readonly contextRetriever: ContextRetriever,

        private readonly guardrails: Guardrails,
        private readonly chatIntentAPIClient: ChatIntentAPIClient | null,
        private readonly extensionClient: ExtensionClient
    ) {
        this.panel = this.createChatController()

        this.disposables.push(
            subscriptionDisposable(
                authStatus
                    .pipe(
                        map(
                            ({ authenticated, endpoint }) =>
                                ({ authenticated, endpoint }) satisfies Pick<
                                    AuthStatus,
                                    'authenticated' | 'endpoint'
                                >
                        ),
                        distinctUntilChanged()
                    )
                    .subscribe(() => {
                        this.disposeAllChats()
                    })
            )
        )
    }

    public async restoreToPanel(panel: vscode.WebviewPanel, chatID: string): Promise<void> {
        try {
            await this.getOrCreateEditorChatController(chatID, panel)
        } catch (error) {
            logDebug('ChatsController', 'restoreToPanel', { error })

            // When failed, create a new panel with restored session and dispose the old panel
            await this.getOrCreateEditorChatController(chatID)
            panel.dispose()
        }
    }

    public registerViewsAndCommands() {
        this.disposables.push(
            vscode.window.registerWebviewViewProvider('cody.chat', this.panel, {
                webviewOptions: { retainContextWhenHidden: true },
            })
        )

        this.disposables.push(
            vscode.commands.registerCommand('cody.chat.moveToEditor', async () => {
                localStorage.setLastUsedChatModality('editor')

                const sessionID = this.panel.sessionID
                await Promise.all([
                    this.getOrCreateEditorChatController(sessionID),
                    this.panel.clearAndRestartSession(),
                ])
            }),
            vscode.commands.registerCommand('cody.chat.moveFromEditor', async () => {
                localStorage.setLastUsedChatModality('sidebar')

                const sessionID = this.activeView?.sessionID
                if (!sessionID) {
                    return
                }
                await Promise.all([
                    this.panel.restoreSession(sessionID),
                    vscode.commands.executeCommand('workbench.action.closeActiveEditor'),
                ])
                await vscode.commands.executeCommand('cody.chat.focus')
            }),

            /**
             * Execute a chat request in a new chat panel or the sidebar chat panel.
             */
            vscode.commands.registerCommand(
                'cody.action.chat',
                async ({
                    text,
                    contextItems,
                    source = DEFAULT_EVENT_SOURCE,
                    command,
                }: ExecuteChatArguments): Promise<ChatSession | undefined> => {
                    let provider: ChatController
                    // If the sidebar panel is visible and empty, use it instead of creating a new panel
                    if (this.panel.isVisible() && this.panel.isEmpty()) {
                        provider = this.panel
                    } else {
                        provider = await this.getOrCreateEditorChatController()
                    }
                    const abortSignal = provider.startNewSubmitOrEditOperation()
                    const editorState = editorStateFromPromptString(text)
                    provider.clearAndRestartSession()
                    await provider.handleUserMessageSubmission({
                        requestID: uuid.v4(),
                        addHumanMessage: {
                            text: text,
                            contextItems: contextItems ?? [],
                            editorState,
                        },
                        signal: abortSignal,
                        source,
                        command,
                    })
                    return provider
                }
            ),
            vscode.commands.registerCommand('cody.chat.signIn', () =>
                vscode.commands.executeCommand('cody.chat.focus')
            ),

            vscode.commands.registerCommand('cody.chat.newPanel', async () => {
                localStorage.setLastUsedChatModality('sidebar')
                const isVisible = this.panel.isVisible()
                await this.panel.clearAndRestartSession()
                if (!isVisible) {
                    await vscode.commands.executeCommand('cody.chat.focus')
                }
            }),
            vscode.commands.registerCommand('cody.chat.newEditorPanel', () => {
                localStorage.setLastUsedChatModality('editor')
                return this.getOrCreateEditorChatController()
            }),
            vscode.commands.registerCommand('cody.chat.new', async () => {
                switch (getNewChatLocation()) {
                    case 'editor':
                        return vscode.commands.executeCommand('cody.chat.newEditorPanel')
                    case 'sidebar':
                        return vscode.commands.executeCommand('cody.chat.newPanel')
                }
            }),

            vscode.commands.registerCommand(
                'cody.chat.toggle',
                async (ops: { editorFocus: boolean }) => {
                    const modality = getNewChatLocation()

                    if (ops.editorFocus) {
                        if (modality === 'sidebar') {
                            await vscode.commands.executeCommand('cody.chat.focus')
                        } else {
                            const editorView = this.activeView?.webviewPanelOrView
                            if (editorView) {
                                revealWebviewViewOrPanel(editorView)
                            } else {
                                vscode.commands.executeCommand('cody.chat.newEditorPanel')
                            }
                        }
                    } else {
                        if (modality === 'sidebar') {
                            await vscode.commands.executeCommand(
                                'workbench.action.focusActiveEditorGroup'
                            )
                        } else {
                            await vscode.commands.executeCommand('workbench.action.navigateEditorGroups')
                        }
                    }
                }
            ),
            vscode.commands.registerCommand('cody.chat.history.export', () => exportHistory()),
            vscode.commands.registerCommand('cody.chat.history.clear', arg => this.clearHistory(arg)),
            vscode.commands.registerCommand('cody.chat.history.delete', item => this.clearHistory(item)),
            vscode.commands.registerCommand('cody.chat.panel.restore', chatID =>
                this.getOrCreateEditorChatController(chatID)
            ),
            vscode.commands.registerCommand(CODY_PASSTHROUGH_VSCODE_OPEN_COMMAND_ID, (...args) =>
                passthroughVsCodeOpen(...args)
            ),

            // Mention selection/file commands
            vscode.commands.registerCommand('cody.mention.selection', uri =>
                this.sendEditorContextToChat(uri)
            ),
            vscode.commands.registerCommand('cody.mention.file', uri =>
                this.sendEditorContextToChat(uri)
            ),

            // Codeblock commands
            vscode.commands.registerCommand(
                'cody.command.markSmartApplyApplied',
                async (result: SmartApplyResult) => {
                    const provider = await this.getActiveChatController()
                    await provider.handleSmartApplyResult(result)
                }
            ),
            vscode.commands.registerCommand(
                'cody.command.insertCodeToCursor',
                (args: { text: string }) => handleCodeFromInsertAtCursor(args.text)
            ),
            vscode.commands.registerCommand(
                'cody.command.insertCodeToNewFile',
                (args: { text: string }) => handleCodeFromSaveToNewFile(args.text, this.options.editor)
            )
        )
    }

    private async sendEditorContextToChat(uri?: URI): Promise<void> {
        telemetryRecorder.recordEvent('cody.addChatContext', 'clicked', {
            billingMetadata: {
                category: 'billable',
                product: 'cody',
            },
        })
        const provider = await this.getActiveChatController()
        if (provider === this.panel) {
            await vscode.commands.executeCommand('cody.chat.focus')
        }
        await provider.handleGetUserEditorContext(uri)
    }

    /**
     * Gets the currently active chat panel provider.
     *
     * If editor panels exist, prefer those. Otherwise, return the sidebar provider.
     *
     * @returns {Promise<ChatController>} The active chat panel provider.
     */
    private async getActiveChatController(): Promise<ChatController> {
        // Check if any existing panel is available
        if (this.activeView) {
            // NOTE: Never reuse webviews when running inside the agent without native webviews
            // TODO: Find out, document why we don't reuse webviews when running inside agent without native webviews
            if (!getConfiguration().hasNativeWebview) {
                return await this.getOrCreateEditorChatController()
            }
            return this.activeView
        }
        return this.panel
    }

    private async clearHistory(chatID?: string): Promise<void> {
        // The chat ID for client to pass in to clear all chats without showing window pop-up for confirmation.
        const ClearWithoutConfirmID = 'clear-all-no-confirm'
        const isClearAll = !chatID || chatID === ClearWithoutConfirmID
        const authStatus = currentAuthStatusAuthed()

        if (isClearAll) {
            if (chatID !== ClearWithoutConfirmID) {
                const userConfirmation = await vscode.window.showWarningMessage(
                    'Are you sure you want to delete all of your chats?',
                    { modal: true },
                    'Delete All Chats'
                )
                if (!userConfirmation) {
                    return
                }
            }
            await chatHistory.clear(authStatus)
            this.disposeAllChats()
            return
        }

        await chatHistory.deleteChat(authStatus, chatID)
        this.disposeChat(chatID, true)
    }

    /**
     * Returns a chat controller for a chat with the given chatID.
     * If an existing editor already exists, use that. Otherwise, create a new one.
     *
     * Post-conditions:
     * - The chat editor will be visible, have focus, and be marked as the active editor
     */
    private async getOrCreateEditorChatController(
        chatID?: string,
        panel?: vscode.WebviewPanel
    ): Promise<ChatController> {
        // For clients without editor chat panels support, always use the sidebar panel.
        const isSidebarOnly = this.extensionClient.capabilities?.webviewNativeConfig?.view === 'single'
        if (isSidebarOnly) {
            return this.panel
        }

        // Look for an existing editor with the same chatID (if given).
        if (chatID && this.views.map(p => p.sessionID).includes(chatID)) {
            const provider = this.views.find(p => p.sessionID === chatID)
            if (provider?.webviewPanelOrView) {
                revealWebviewViewOrPanel(provider.webviewPanelOrView)
                this.activeView = provider
                return provider
            }
        }

        // Otherwise, create a new one.
        const chatController = this.createChatController()
        if (chatID) {
            chatController.restoreSession(chatID)
        }

        if (panel) {
            // Connect the controller with the existing editor panel
            this.activeView = chatController
            await chatController.revive(panel)
        } else {
            // Create a new editor panel on top of an existing one
            const activePanelViewColumn = this.activeView?.webviewPanelOrView
                ? webviewViewOrPanelViewColumn(this.activeView?.webviewPanelOrView)
                : undefined
            await chatController.createWebviewViewOrPanel(activePanelViewColumn)
        }

        this.activeView = chatController
        this.views.push(chatController)
        if (chatController.webviewPanelOrView) {
            webviewViewOrPanelOnDidChangeViewState(chatController.webviewPanelOrView)(e => {
                if (e.webviewPanel.visible && e.webviewPanel.active) {
                    this.activeView = chatController
                }
            })
            chatController.webviewPanelOrView.onDidDispose(() => {
                this.disposeChat(chatController.sessionID, false)
            })
        }

        return chatController
    }

    /**
     * Creates a provider for a chat view.
     */
    private createChatController(): ChatController {
        return new ChatController({
            ...this.options,
            chatClient: this.chatClient,
            guardrails: this.guardrails,
            startTokenReceiver: this.options.startTokenReceiver,
            chatIntentAPIClient: this.chatIntentAPIClient,
            contextRetriever: this.contextRetriever,
            extensionClient: this.extensionClient,
        })
    }

    private disposeChat(chatID: string, includePanel: boolean): void {
        if (chatID === this.activeView?.sessionID) {
            this.activeView = undefined
        }

        const providerIndex = this.views.findIndex(p => p.sessionID === chatID)
        if (providerIndex !== -1) {
            const removedProvider = this.views.splice(providerIndex, 1)[0]
            if (removedProvider.webviewPanelOrView) {
                disposeWebviewViewOrPanel(removedProvider.webviewPanelOrView)
            }
            removedProvider.dispose()
        }

        if (includePanel && chatID === this.panel?.sessionID) {
            this.panel.clearAndRestartSession()
        }
    }

    /**
     * Dispose all open chat views and restart the panel view.
     */
    private disposeAllChats(): void {
        this.activeView = undefined

        const oldViews = this.views
        this.views = []
        for (const view of oldViews) {
            if (view.webviewPanelOrView) {
                disposeWebviewViewOrPanel(view.webviewPanelOrView)
            }
            view.dispose()
        }

        this.panel.clearAndRestartSession()
    }

    public dispose(): void {
        this.disposeAllChats()
        vscode.Disposable.from(...this.disposables).dispose()
    }
}

function getNewChatLocation(): ChatLocation {
    const chatDefaultLocation =
        vscode.workspace
            .getConfiguration()
            .get<'sticky' | 'sidebar' | 'editor'>('cody.chat.defaultLocation') ?? 'sticky'

    if (chatDefaultLocation === 'sticky') {
        return localStorage.getLastUsedChatModality()
    }
    return chatDefaultLocation
}

/**
 * See docstring for {@link CODY_PASSTHROUGH_VSCODE_OPEN_COMMAND_ID}.
 */
async function passthroughVsCodeOpen(...args: unknown[]): Promise<void> {
    if (args[1] && (args[1] as any).viewColumn === vscode.ViewColumn.Beside) {
        // Make vscode.ViewColumn.Beside work as expected from a webview: open it to the side,
        // instead of always opening a new editor to the right.
        //
        // If the active editor is undefined, that means the chat panel is the active editor, so
        // we will open the file in the first visible editor instead.
        const textEditor = vscode.window.activeTextEditor || vscode.window.visibleTextEditors[0]
        ;(args[1] as any).viewColumn = textEditor ? textEditor.viewColumn : vscode.ViewColumn.Beside
    }
    if (args[1] && Array.isArray((args[1] as any).selection)) {
        // Fix a weird issue where the selection was getting encoded as a JSON array, not an
        // object.
        ;(args[1] as any).selection = new vscode.Selection(
            (args[1] as any).selection[0],
            (args[1] as any).selection[1]
        )
    }
    await vscode.commands.executeCommand('vscode.open', ...args)
}
