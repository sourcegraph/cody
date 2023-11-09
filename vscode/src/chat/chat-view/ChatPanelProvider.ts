import * as vscode from 'vscode'

import { CodyPrompt, CustomCommandType } from '@sourcegraph/cody-shared/src/chat/prompts'
import { ChatMessage, UserLocalHistory } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { View } from '../../../webviews/NavBar'
import { logDebug } from '../../log'
import { telemetryService } from '../../services/telemetry'
import { telemetryRecorder } from '../../services/telemetry-v2'
import { createCodyChatTreeItems } from '../../services/treeViewItems'
import { TreeViewProvider } from '../../services/TreeViewProvider'
import {
    handleCodeFromInsertAtCursor,
    handleCodeFromSaveToNewFile,
    handleCopiedCode,
} from '../../services/utils/codeblock-action-tracker'
import { openExternalLinks, openFilePath, openLocalFileWithRange } from '../../services/utils/workspace-action'
import { MessageErrorType, MessageProvider, MessageProviderOptions } from '../MessageProvider'
import { ExtensionMessage, getChatModelsForWebview, WebviewMessage } from '../protocol'

import { addWebviewViewHTML } from './ChatManager'

export interface ChatViewProviderWebview extends Omit<vscode.Webview, 'postMessage'> {
    postMessage(message: ExtensionMessage): Thenable<boolean>
}

export interface ChatPanelProviderOptions extends MessageProviderOptions {
    extensionUri: vscode.Uri
    treeView: TreeViewProvider
}

export class ChatPanelProvider extends MessageProvider {
    private extensionUri: vscode.Uri
    public webview?: ChatViewProviderWebview
    public webviewPanel: vscode.WebviewPanel | undefined = undefined
    public treeView: TreeViewProvider

    constructor({ treeView, extensionUri, ...options }: ChatPanelProviderOptions) {
        super(options)
        this.extensionUri = extensionUri
        this.treeView = treeView
    }

    private async onDidReceiveMessage(message: WebviewMessage): Promise<void> {
        switch (message.command) {
            case 'ready':
                // The web view is ready to receive events. We need to make sure that it has an up
                // to date config, even if it was already published
                await this.authProvider.announceNewAuthStatus()
                break
            case 'initialized':
                logDebug('ChatPanelProvider:onDidReceiveMessage', 'initialized')
                await this.init(this.startUpChatID)
                this.handleChatModel()
                break
            case 'submit':
                await this.onHumanMessageSubmitted(message.text, message.submitType)
                break
            case 'edit':
                this.transcript.removeLastInteraction()
                await this.onHumanMessageSubmitted(message.text, 'user')
                telemetryService.log('CodyVSCodeExtension:editChatButton:clicked', undefined, { hasV2Event: true })
                telemetryRecorder.recordEvent('cody.editChatButton', 'clicked')
                break
            case 'abort':
                await this.abortCompletion()
                telemetryService.log(
                    'CodyVSCodeExtension:abortButton:clicked',
                    { source: 'sidebar' },
                    { hasV2Event: true }
                )
                telemetryRecorder.recordEvent('cody.sidebar.abortButton', 'clicked')
                break
            case 'chatModel':
                this.chatModel = message.model
                this.transcript.setChatModel(message.model)
                break
            case 'executeRecipe':
                await this.executeRecipe(message.recipe, '', 'chat')
                break
            case 'custom-prompt':
                await this.onCustomPromptClicked(message.title, message.value)
                break
            case 'insert':
                await handleCodeFromInsertAtCursor(message.text, message.metadata)
                break
            case 'newFile':
                handleCodeFromSaveToNewFile(message.text, message.metadata)
                await this.editor.createWorkspaceFile(message.text)
                break
            case 'copy':
                await handleCopiedCode(message.text, message.eventType === 'Button', message.metadata)
                break
            case 'event':
                telemetryService.log(message.eventName, message.properties)
                break
            case 'links':
                void openExternalLinks(message.value)
                break
            case 'openFile':
                await openFilePath(message.filePath, this.webviewPanel?.viewColumn)
                break
            case 'openLocalFileWithRange':
                await openLocalFileWithRange(message.filePath, message.range)
                break
            default:
                this.handleError('Invalid request type from Webview Panel', 'system')
        }
    }

    private async onHumanMessageSubmitted(text: string, submitType: 'user' | 'suggestion' | 'example'): Promise<void> {
        logDebug('ChatPanelProvider:onHumanMessageSubmitted', 'chat', { verbose: { text, submitType } })
        MessageProvider.inputHistory.push(text)
        await this.executeRecipe('chat-question', text, 'chat')
        if (submitType === 'suggestion') {
            telemetryService.log('CodyVSCodeExtension:chatPredictions:used', undefined, { hasV2Event: true })
        }
    }

    /**
     * Process custom command click
     */
    private async onCustomPromptClicked(title: string, commandType: CustomCommandType = 'user'): Promise<void> {
        telemetryService.log('CodyVSCodeExtension:command:customMenu:clicked', undefined, { hasV2Event: true })
        logDebug('ChatPanelProvider:onCustomPromptClicked', title)
        if (!this.isCustomCommandAction(title)) {
            await this.setWebviewView('chat')
        }
        await this.executeCustomCommand(title, commandType)
    }

    /**
     * Send transcript to webview
     */
    protected handleTranscript(transcript: ChatMessage[], isMessageInProgress: boolean): void {
        void this.webview?.postMessage({
            type: 'transcript',
            messages: transcript,
            isMessageInProgress,
        })

        // Update webview panel title
        const text = this.transcript.getLastInteraction()?.getHumanMessage()?.displayText
        if (text && this.webviewPanel) {
            this.webviewPanel.title = text.length > 10 ? `${text?.slice(0, 20)}...` : text
        }
    }

    /**
     * Send transcript error to webview
     */
    protected handleTranscriptErrors(transcriptError: boolean): void {
        void this.webview?.postMessage({ type: 'transcript-errors', isTranscriptError: transcriptError })
    }

    protected handleSuggestions(suggestions: string[]): void {
        void this.webview?.postMessage({
            type: 'suggestions',
            suggestions,
        })
    }

    /**
     * Update chat history in Tree View
     */
    protected handleHistory(userHistory?: UserLocalHistory): void {
        const history = userHistory || {
            chat: MessageProvider.chatHistory,
            input: MessageProvider.inputHistory,
        }
        this.treeView.updateTree(createCodyChatTreeItems(history))
    }

    /**
     * Sends the available chat models to the webview based on the authenticated endpoint.
     * Maps over the allowed models, adding a 'default' property if the model matches the currently selected chatModel.
     */
    protected handleChatModel(): void {
        const endpoint = this.authProvider.getAuthStatus()?.endpoint
        const allowedModels = getChatModelsForWebview(endpoint)
        const models = this.chatModel
            ? allowedModels.map(model => {
                  return {
                      ...model,
                      default: model.model === this.chatModel,
                  }
              })
            : allowedModels

        void this.webview?.postMessage({
            type: 'chatModels',
            models,
        })
    }

    /**
     * Display error message in webview, either as part of the transcript or as a banner alongside the chat.
     */
    public handleError(errorMsg: string, type: MessageErrorType): void {
        if (type === 'transcript') {
            this.transcript.addErrorAsAssistantResponse(errorMsg)
            void this.webview?.postMessage({ type: 'transcript-errors', isTranscriptError: true })
            return
        }

        void this.webview?.postMessage({ type: 'errors', errors: errorMsg })
    }

    protected handleCodyCommands(prompts: [string, CodyPrompt][]): void {
        void this.webview?.postMessage({
            type: 'custom-prompts',
            prompts,
        })
    }

    /**
     *
     * @param notice Triggers displaying a notice.
     * @param notice.key The key of the notice to display.
     */
    public triggerNotice(notice: { key: string }): void {
        void this.webview?.postMessage({
            type: 'notice',
            notice,
        })
    }

    /**
     * Set webview view
     * NOTE: Panel doesn't support view other than 'chat' currently
     */
    public async setWebviewView(view: View): Promise<void> {
        await this.webview?.postMessage({
            type: 'view',
            messages: view,
        })

        if (view !== 'chat') {
            return
        }

        if (!this.webviewPanel) {
            await this.createWebviewPanel(this.sessionID)
        }
        this.webviewPanel?.reveal()
    }

    private startUpChatID?: string = undefined

    public async clearChatHistory(chatID?: string): Promise<void> {
        if (chatID) {
            await this.deleteHistory(chatID)
            return
        }
        await this.clearHistory()
        this.webviewPanel?.dispose()
    }

    /**
     * Creates the webview panel for the Cody chat interface if it doesn't already exist.
     */
    public async createWebviewPanel(chatID?: string, lastQuestion?: string): Promise<vscode.WebviewPanel | undefined> {
        // Create the webview panel only if the user is logged in.
        // Allows users to login via the sidebar webview.
        if (!this.authProvider.getAuthStatus()?.isLoggedIn || !this.contextProvider.config.experimentalChatPanel) {
            await vscode.commands.executeCommand('setContext', 'cody.chatPanel', false)
            return
        }

        // Checks if the webview panel already exists and is visible.
        // If so, returns early to avoid creating a duplicate.
        if (this.webviewPanel) {
            return this.webviewPanel
        }

        this.startUpChatID = chatID

        const viewType = 'cody.chatPanel'
        // truncate firstQuestion to first 10 chars
        const text = lastQuestion && lastQuestion?.length > 10 ? `${lastQuestion?.slice(0, 20)}...` : lastQuestion
        const panelTitle = text || 'New Chat'
        const webviewPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webviews')

        const panel = vscode.window.createWebviewPanel(
            viewType,
            panelTitle,
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                enableFindWidget: true,
                localResourceRoots: [webviewPath],
                enableCommandUris: true,
            }
        )

        panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'resources', 'cody.png')
        await addWebviewViewHTML(this.extensionUri, panel)

        // Register webview
        this.webviewPanel = panel
        this.webview = panel.webview
        this.contextProvider.webview = panel.webview
        this.authProvider.webview = panel.webview

        // Dispose panel when the panel is closed
        panel.onDidDispose(() => {
            this.webviewPanel = undefined
            panel.dispose()
        })

        this.disposables.push(panel.webview.onDidReceiveMessage(message => this.onDidReceiveMessage(message)))

        // Used for keeping sidebar chat view closed when webview panel is enabled
        await vscode.commands.executeCommand('setContext', 'cody.chatPanel', true)
        telemetryService.log('CodyVSCodeExtension:createWebviewPanel:clicked', undefined, { hasV2Event: true })

        return panel
    }
}
