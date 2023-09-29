import * as vscode from 'vscode'

import { CodyPrompt, CustomCommandType } from '@sourcegraph/cody-shared/src/chat/prompts'
import { ChatMessage, UserLocalHistory } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { View } from '../../webviews/NavBar'
import { logDebug } from '../log'
import { AuthProviderSimplified } from '../services/AuthProviderSimplified'
import { LocalAppWatcher } from '../services/LocalAppWatcher'
import * as OnboardingExperiment from '../services/OnboardingExperiment'
import { telemetryService } from '../services/telemetry'

import { MessageProvider, MessageProviderOptions } from './MessageProvider'
import {
    APP_LANDING_URL,
    APP_REPOSITORIES_URL,
    archConvertor,
    ExtensionMessage,
    isOsSupportedByApp,
    WebviewMessage,
} from './protocol'

export interface ChatViewProviderWebview extends Omit<vscode.Webview, 'postMessage'> {
    postMessage(message: ExtensionMessage): Thenable<boolean>
}

interface ChatViewProviderOptions extends MessageProviderOptions {
    extensionUri: vscode.Uri
}

export class ChatViewProvider extends MessageProvider implements vscode.WebviewViewProvider {
    private extensionUri: vscode.Uri
    public webview?: ChatViewProviderWebview

    constructor({ extensionUri, ...options }: ChatViewProviderOptions) {
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
                logDebug('ChatViewProvider:onDidReceiveMessage:initialized', '')
                await this.init()
                break
            case 'submit':
                await this.onHumanMessageSubmitted(message.text, message.submitType)
                break
            case 'edit':
                this.transcript.removeLastInteraction()
                await this.onHumanMessageSubmitted(message.text, 'user')
                telemetryService.log('CodyVSCodeExtension:editChatButton:clicked')
                break
            case 'abort':
                await this.abortCompletion()
                telemetryService.log('CodyVSCodeExtension:abortButton:clicked', { source: 'sidebar' })
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
                    telemetryService.log(`CodyVSCodeExtension:${value}:clicked`) // TODO(sqs): remove when new events are working
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
                if (message.type === 'simplified-onboarding-exposure') {
                    await OnboardingExperiment.logExposure()
                    break
                }
                // cody.auth.signin or cody.auth.signout
                await vscode.commands.executeCommand(`cody.auth.${message.type}`)
                break
            case 'insert':
                await this.handleInsertAtCursor(message.text)
                break
            case 'newFile':
                await this.handleSaveToNewFile(message.text)
                break
            case 'copy':
                await this.handleCopiedCode(message.text, message.eventType)
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
                telemetryService.log('CodyVSCodeExtension:authReloadButton:clicked')
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
                break
            default:
                this.handleError('Invalid request type from Webview')
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
        logDebug('ChatViewProvider:onHumanMessageSubmitted', 'sidebar', { verbose: { text, submitType } })
        if (submitType === 'suggestion') {
            telemetryService.log('CodyVSCodeExtension:chatPredictions:used')
        }
        if (text === '/') {
            void vscode.commands.executeCommand('cody.action.commands.menu', true)
            return
        }
        MessageProvider.inputHistory.push(text)
        if (this.contextProvider.config.experimentalChatPredictions) {
            void this.runRecipeForSuggestion('next-questions', text)
        }
        await this.executeRecipe('chat-question', text)
    }

    /**
     * Process custom command click
     */
    private async onCustomPromptClicked(title: string, commandType: CustomCommandType = 'user'): Promise<void> {
        telemetryService.log('CodyVSCodeExtension:command:customMenu:clicked')
        logDebug('ChatViewProvider:onCustomPromptClicked', title)
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
     * Sends chat history to webview
     */
    protected handleHistory(history: UserLocalHistory): void {
        void this.webview?.postMessage({
            type: 'history',
            messages: history,
        })
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
    private async handleInsertAtCursor(text: string): Promise<void> {
        const selectionRange = vscode.window.activeTextEditor?.selection
        const editor = vscode.window.activeTextEditor
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
        this.editor.controllers.inline?.setLastCopiedCode(text, eventName)
    }

    /**
     * Handles insert event to insert text from code block to new file
     */
    private async handleSaveToNewFile(text: string): Promise<void> {
        // Log insert event
        const op = 'save'
        const eventName = op + 'Button'
        this.editor.controllers.inline?.setLastCopiedCode(text, eventName)

        await this.editor.createWorkspaceFile(text)
    }

    /**
     * Handles copying code and detecting a paste event.
     *
     * @param text - The text from code block when copy event is triggered
     * @param eventType - Either 'Button' or 'Keydown'
     */
    private async handleCopiedCode(text: string, eventType: 'Button' | 'Keydown'): Promise<void> {
        // If it's a Button event, then the text is already passed in from the whole code block
        const copiedCode = eventType === 'Button' ? text : await vscode.env.clipboard.readText()
        const eventName = eventType === 'Button' ? 'copyButton' : 'keyDown:Copy'
        // Send to Inline Controller for tracking
        if (copiedCode) {
            this.editor.controllers.inline?.setLastCopiedCode(copiedCode, eventName)
        }
    }

    protected handleCodyCommands(prompts: [string, CodyPrompt][]): void {
        void this.webview?.postMessage({
            type: 'custom-prompts',
            prompts,
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

        // Create Webview using vscode/index.html
        const root = vscode.Uri.joinPath(webviewPath, 'index.html')
        const bytes = await vscode.workspace.fs.readFile(root)
        const decoded = new TextDecoder('utf-8').decode(bytes)
        const resources = webviewView.webview.asWebviewUri(webviewPath)

        // Set HTML for webview
        // This replace variables from the vscode/dist/index.html with webview info
        // 1. Update URIs to load styles and scripts into webview (eg. path that starts with ./)
        // 2. Update URIs for content security policy to only allow specific scripts to be run
        webviewView.webview.html = decoded
            .replaceAll('./', `${resources.toString()}/`)
            .replaceAll('{cspSource}', webviewView.webview.cspSource)

        // Register webview
        this.disposables.push(webviewView.webview.onDidReceiveMessage(message => this.onDidReceiveMessage(message)))
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
}
