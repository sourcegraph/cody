import * as vscode from 'vscode'

import { CodyPrompt, CustomCommandType } from '@sourcegraph/cody-shared/src/chat/prompts'
import { ChatMessage, UserLocalHistory } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { View } from '../../../webviews/NavBar'
import { getActiveEditor } from '../../editor/active-editor'
import { logDebug } from '../../log'
import { telemetryService } from '../../services/telemetry'
import { telemetryRecorder } from '../../services/telemetry-v2'
import { createCodyChatTreeItems } from '../../services/treeViewItems'
import { TreeViewProvider } from '../../services/TreeViewProvider'
import { MessageProvider, MessageProviderOptions } from '../MessageProvider'
import { ExtensionMessage, WebviewMessage } from '../protocol'

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
            case 'executeRecipe':
                await this.setWebviewView('chat')
                await this.executeRecipe(message.recipe, '', 'chat')
                break
            case 'insert':
                await this.handleInsertAtCursor(message.text, message.source)
                break
            case 'newFile':
                await this.handleSaveToNewFile(message.text, message.source)
                break
            case 'copy':
                await this.handleCopiedCode(message.text, message.eventType, message.source)
                break
            case 'event':
                telemetryService.log(message.eventName, message.properties)
                break
            case 'links':
                void this.openExternalLinks(message.value)
                break
            case 'custom-prompt':
                await this.onCustomPromptClicked(message.title, message.value)
                break
            case 'openFile':
                await this.openFilePath(message.filePath)
                break
            case 'openLocalFileWithRange':
                await this.openLocalFileWithRange(
                    message.filePath,
                    message.range
                        ? new vscode.Range(
                              message.range.startLine,
                              message.range.startCharacter,
                              message.range.endLine,
                              message.range.endCharacter
                          )
                        : undefined
                )
                break
            default:
                this.handleError('Invalid request type from Webview')
        }
    }

    private async onHumanMessageSubmitted(text: string, submitType: 'user' | 'suggestion' | 'example'): Promise<void> {
        logDebug('ChatPanelProvider:onHumanMessageSubmitted', 'sidebar', { verbose: { text, submitType } })
        if (submitType === 'suggestion') {
            telemetryService.log('CodyVSCodeExtension:chatPredictions:used', undefined, { hasV2Event: true })
        }
        if (text === '/') {
            void vscode.commands.executeCommand('cody.action.commands.menu', true)
            return
        }
        MessageProvider.inputHistory.push(text)
        if (this.contextProvider.config.experimentalChatPredictions) {
            void this.runRecipeForSuggestion('next-questions', text)
        }
        await this.executeRecipe('chat-question', text, 'chat')
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
     * Display error message in webview view as banner in chat view
     * It does not display error message as assistant response
     */
    public handleError(errorMsg: string): void {
        void this.webview?.postMessage({ type: 'errors', errors: errorMsg })
    }

    /**
     * Handles insert event to insert text from code block at cursor position
     * Replace selection if there is one and then log insert event
     * Note: Using workspaceEdit instead of 'editor.action.insertSnippet' as the later reformats the text incorrectly
     */
    private async handleInsertAtCursor(text: string, source?: string): Promise<void> {
        const selectionRange = getActiveEditor()?.selection
        const editor = getActiveEditor()
        if (!editor || !selectionRange) {
            this.handleError('No editor or selection found to insert text')
            return
        }

        const edit = new vscode.WorkspaceEdit()
        // trimEnd() to remove new line added by Cody
        edit.insert(editor.document.uri, selectionRange.start, text + '\n')
        await vscode.workspace.applyEdit(edit)

        // Log insert event
        const op = 'insert'
        const eventName = op + 'Button'
        this.editor.controllers.inline?.setLastCopiedCode(text, eventName, source)
    }

    /**
     * Handles insert event to insert text from code block to new file
     */
    private async handleSaveToNewFile(text: string, source?: string): Promise<void> {
        // Log insert event
        const op = 'save'
        const eventName = op + 'Button'
        this.editor.controllers.inline?.setLastCopiedCode(text, eventName, source)

        await this.editor.createWorkspaceFile(text)
    }

    /**
     * Handles copying code and detecting a paste event.
     * @param text - The text from code block when copy event is triggered
     * @param eventType - Either 'Button' or 'Keydown'
     */
    private async handleCopiedCode(text: string, eventType: 'Button' | 'Keydown', source?: string): Promise<void> {
        // If it's a Button event, then the text is already passed in from the whole code block
        const copiedCode = eventType === 'Button' ? text : await vscode.env.clipboard.readText()
        const eventName = eventType === 'Button' ? 'copyButton' : 'keyDown:Copy'
        // Send to Inline Controller for tracking
        if (copiedCode) {
            this.editor.controllers.inline?.setLastCopiedCode(copiedCode, eventName, source)
        }
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
            await this.createWebviewPanel(this.currentChatID)
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
     * Open file in editor or in sourcegraph
     */
    protected async openFilePath(filePath: string): Promise<void> {
        const rootUri = this.editor.getWorkspaceRootUri()
        if (!rootUri) {
            this.handleError('Failed to open file: missing rootUri')
            return
        }
        try {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(rootUri, filePath))
            await vscode.window.showTextDocument(doc)
        } catch {
            // Try to open the file in the sourcegraph view
            const sourcegraphSearchURL = new URL(
                `/search?q=context:global+file:${filePath}`,
                this.contextProvider.config.serverEndpoint
            ).href
            void this.openExternalLinks(sourcegraphSearchURL)
        }
    }

    /**
     * Open file in editor (assumed filePath is absolute) and optionally reveal a specific range
     */
    protected async openLocalFileWithRange(filePath: string, range?: vscode.Range): Promise<void> {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath))
        await vscode.window.showTextDocument(doc, { selection: range })
    }

    /**
     * Open external links
     */
    private async openExternalLinks(uri: string): Promise<void> {
        try {
            await vscode.env.openExternal(vscode.Uri.parse(uri))
        } catch (error) {
            throw new Error(`Failed to open file: ${error}`)
        }
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

        const viewType = chatID || 'cody.newChat'
        // truncate firstQuestion to first 10 chars
        const text = lastQuestion && lastQuestion?.length > 10 ? `${lastQuestion?.slice(0, 20)}...` : lastQuestion
        const panelTitle = text || 'New Chat'
        const webviewPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webviews')

        const panel = vscode.window.createWebviewPanel(
            viewType,
            panelTitle,
            { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
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
