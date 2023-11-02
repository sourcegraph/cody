import * as vscode from 'vscode'

import { CodyPrompt, CustomCommandType } from '@sourcegraph/cody-shared/src/chat/prompts'
import { ChatMessage, UserLocalHistory } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { DOTCOM_URL } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'

import { View } from '../../../webviews/NavBar'
import { getActiveEditor } from '../../editor/active-editor'
import { getOpenTabsRelativePaths } from '../../editor/utils/open-tabs'
import { logDebug } from '../../log'
import { AuthProviderSimplified } from '../../services/AuthProviderSimplified'
import { LocalAppWatcher } from '../../services/LocalAppWatcher'
import { telemetryService } from '../../services/telemetry'
import { telemetryRecorder } from '../../services/telemetry-v2'
import { MessageErrorType, MessageProvider, MessageProviderOptions } from '../MessageProvider'
import {
    APP_LANDING_URL,
    APP_REPOSITORIES_URL,
    archConvertor,
    ExtensionMessage,
    isOsSupportedByApp,
    WebviewMessage,
} from '../protocol'

import { addWebviewViewHTML } from './ChatManager'
import { getFileMatchesForChat, getSymbolsForChat } from './utils'

export interface SidebarChatWebview extends Omit<vscode.Webview, 'postMessage'> {
    postMessage(message: ExtensionMessage): Thenable<boolean>
}

export interface SidebarChatOptions extends MessageProviderOptions {
    extensionUri: vscode.Uri
}

export class SidebarChatProvider extends MessageProvider implements vscode.WebviewViewProvider {
    private extensionUri: vscode.Uri
    public webview?: SidebarChatWebview
    public webviewPanel: vscode.WebviewPanel | undefined = undefined

    constructor({ extensionUri, ...options }: SidebarChatOptions) {
        super(options)
        this.extensionUri = extensionUri

        const localAppWatcher = new LocalAppWatcher()
        this.disposables.push(localAppWatcher)
        this.disposables.push(localAppWatcher.onChange(appWatcher => this.appWatcherChanged(appWatcher)))
        this.disposables.push(localAppWatcher.onTokenFileChange(tokenFile => this.tokenFileChanged(tokenFile)))
    }

    private async onDidReceiveMessage(message: WebviewMessage): Promise<void> {
        switch (message.command) {
            case 'ready':
                // The web view is ready to receive events. We need to make sure that it has an up
                // to date config, even if it was already published
                await this.authProvider.announceNewAuthStatus()
                break
            case 'initialized':
                logDebug('SidebarChatProvider:onDidReceiveMessage', 'initialized')
                await this.setWebviewView('chat')
                await this.init()
                break
            case 'fileMatch':
                await this.handleFileMatchFinder(message.text)
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
                await this.executeRecipe(message.recipe)
                break
            case 'auth':
                if (message.type === 'app' && message.endpoint) {
                    await this.authProvider.appAuth(message.endpoint)
                    // Log app button click events: e.g. app:download:clicked or app:connect:clicked
                    const value = message.value === 'download' ? 'app:download' : 'app:connect'
                    telemetryService.log(`CodyVSCodeExtension:${value}:clicked`, undefined, { hasV2Event: true }) // TODO(sqs): remove when new events are working
                    telemetryRecorder.recordEvent(`cody.${value}`, 'clicked')
                    break
                }
                if (message.type === 'callback' && message.endpoint) {
                    this.authProvider.redirectToEndpointLogin(message.endpoint)
                    break
                }
                if (message.type === 'simplified-onboarding') {
                    const authProviderSimplified = new AuthProviderSimplified()
                    const authMethod = message.authMethod || 'dotcom'
                    void authProviderSimplified.openExternalAuthUrl(this.authProvider, authMethod)
                    break
                }
                // cody.auth.signin or cody.auth.signout
                await vscode.commands.executeCommand(`cody.auth.${message.type}`)
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
            case 'history':
                if (message.action === 'clear') {
                    await this.clearHistory()
                }
                if (message.action === 'export') {
                    await this.exportHistory()
                }
                break
            case 'restoreHistory':
                await this.restoreSession(message.chatID)
                break
            case 'deleteHistory':
                await this.deleteHistory(message.chatID)
                break
            case 'links':
                void this.openExternalLinks(message.value)
                break
            case 'custom-prompt':
                await this.onCustomPromptClicked(message.title, message.value)
                break
            case 'reload':
                await this.authProvider.reloadAuthStatus()
                telemetryService.log('CodyVSCodeExtension:authReloadButton:clicked', undefined, { hasV2Event: true })
                telemetryRecorder.recordEvent('cody.authReloadButton', 'clicked')
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
            case 'simplified-onboarding':
                if (message.type === 'install-app') {
                    void this.simplifiedOnboardingInstallApp()
                    break
                }
                if (message.type === 'open-app') {
                    void this.openExternalLinks(APP_REPOSITORIES_URL.href)
                    break
                }
                if (message.type === 'reload-state') {
                    void this.simplifiedOnboardingReloadEmbeddingsState()
                    break
                }
                if (message.type === 'web-sign-in-token') {
                    void vscode.window.showInputBox({ prompt: 'Enter web sign-in token' }).then(async token => {
                        if (!token) {
                            return
                        }
                        const authStatus = await this.authProvider.auth(DOTCOM_URL.href, token)
                        if (!authStatus?.isLoggedIn) {
                            void vscode.window.showErrorMessage(
                                'Authentication failed. Please check your token and try again.'
                            )
                        }
                    })
                    break
                }
                break
            default:
                this.handleError('Invalid request type from Webview', 'system')
        }
    }

    private async simplifiedOnboardingInstallApp(): Promise<void> {
        const os = process.platform
        const arch = process.arch
        const DOWNLOAD_URL =
            os && arch && isOsSupportedByApp(os, arch)
                ? `https://sourcegraph.com/.api/app/latest?arch=${archConvertor(arch)}&target=${os}`
                : APP_LANDING_URL.href
        await this.openExternalLinks(DOWNLOAD_URL)
    }

    public async simplifiedOnboardingReloadEmbeddingsState(): Promise<void> {
        await this.contextProvider.forceUpdateCodebaseContext()
    }

    private appWatcherChanged(appWatcher: LocalAppWatcher): void {
        void this.webview?.postMessage({ type: 'app-state', isInstalled: appWatcher.isInstalled })
        void this.simplifiedOnboardingReloadEmbeddingsState()
    }

    private tokenFileChanged(file: vscode.Uri): void {
        void this.authProvider.appDetector
            .tryFetchAppJson(file)
            .then(() => this.simplifiedOnboardingReloadEmbeddingsState())
    }

    private async onHumanMessageSubmitted(text: string, submitType: 'user' | 'suggestion' | 'example'): Promise<void> {
        logDebug('SidebarChatProvider:onHumanMessageSubmitted', 'sidebar', { verbose: { text, submitType } })
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
        await this.executeRecipe('custom-prompt', text, 'chat')
    }

    /**
     * Process custom command click
     */
    private async onCustomPromptClicked(title: string, commandType: CustomCommandType = 'user'): Promise<void> {
        telemetryService.log('CodyVSCodeExtension:command:customMenu:clicked', undefined, { hasV2Event: true })
        logDebug('SidebarChatProvider:onCustomPromptClicked', title)
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
    }

    protected handleSuggestions(suggestions: string[]): void {
        void this.webview?.postMessage({
            type: 'suggestions',
            suggestions,
        })
    }

    /**
     * Sends chat history to webview
     */
    protected handleHistory(history: UserLocalHistory): void {
        void this.webview?.postMessage({
            type: 'history',
            messages: history,
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

    /**
     * Handles insert event to insert text from code block at cursor position
     * Replace selection if there is one and then log insert event
     * Note: Using workspaceEdit instead of 'editor.action.insertSnippet' as the later reformats the text incorrectly
     */
    private async handleInsertAtCursor(text: string, source?: string): Promise<void> {
        const selectionRange = getActiveEditor()?.selection
        const editor = getActiveEditor()
        if (!editor || !selectionRange) {
            this.handleError('No editor or selection found to insert text', 'system')
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

    private async handleFileMatchFinder(input: string): Promise<void> {
        // Get files and symbols asynchronously
        const [files, symbols] = await Promise.all([
            input.length < 3 ? getOpenTabsRelativePaths() : await getFileMatchesForChat(input),
            getSymbolsForChat(input, 5),
        ])

        void this.webview?.postMessage({
            type: 'inputContextMatches',
            kind: 'file',
            matches: files,
        })

        void this.webview?.postMessage({
            type: 'inputContextMatches',
            kind: 'symbol',
            matches: symbols
                ?.slice(0, 5)
                .map(symbol => ({ title: symbol.name, fsPath: symbol.uri.fsPath, kind: 'symbol' })),
        })
    }

    /**
     *
     * @param notice Triggers displaying a notice.
     * @param notice.key The key of the notice to display.
     */
    public triggerNotice(notice: { key: string }): void {
        // They may not have chat open, and given the current notices are
        // designed to be triggered once only during onboarding, we open the
        // chat view. If we have other notices and this feels too aggressive, we
        // can make it be conditional on the type of notice being triggered.
        void vscode.commands.executeCommand('cody.chat.focus', {
            // Notices are not meant to steal focus from the editor
            preserveFocus: true,
        })
        void this.webview?.postMessage({
            type: 'notice',
            notice,
        })
    }

    /**
     * Set webview view
     */
    public async setWebviewView(view: View): Promise<void> {
        await vscode.commands.executeCommand('cody.chat.focus')
        await this.webview?.postMessage({
            type: 'view',
            messages: view,
        })
    }

    /**
     * Clears the chat history for the given chatID.
     * If no chatID is provided, clears all chat history.
     */
    public async clearChatHistory(chatID?: string): Promise<void> {
        if (!chatID) {
            await this.clearAndRestartSession()
            await this.clearHistory()
            return
        }
        await this.deleteHistory(chatID)
        return
    }

    /**
     * Open file in editor or in sourcegraph
     */
    protected async openFilePath(filePath: string): Promise<void> {
        const rootUri = this.editor.getWorkspaceRootUri()
        if (!rootUri) {
            this.handleError('Failed to open file: missing rootUri', 'system')
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
     * create webview resources
     */
    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _context: vscode.WebviewViewResolveContext<unknown>,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _token: vscode.CancellationToken
    ): Promise<void> {
        this.webview = webviewView.webview
        this.authProvider.webview = webviewView.webview
        this.contextProvider.webview = webviewView.webview

        const webviewPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webviews')
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [webviewPath],
            enableCommandUris: true,
        }

        await addWebviewViewHTML(this.extensionUri, webviewView)

        // Register webview
        this.disposables.push(webviewView.webview.onDidReceiveMessage(message => this.onDidReceiveMessage(message)))
    }
}
