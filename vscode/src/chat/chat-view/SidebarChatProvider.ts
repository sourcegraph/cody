import { debounce } from 'lodash'
import * as vscode from 'vscode'

import { ContextFile } from '@sourcegraph/cody-shared'
import { CodyPrompt, CustomCommandType } from '@sourcegraph/cody-shared/src/chat/prompts'
import { ChatMessage, UserLocalHistory } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { DOTCOM_URL } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'
import { ChatSubmitType } from '@sourcegraph/cody-ui/src/Chat'

import { View } from '../../../webviews/NavBar'
import { getFileContextFiles, getOpenTabsContextFile, getSymbolContextFiles } from '../../editor/utils/editor-context'
import { logDebug } from '../../log'
import { AuthProviderSimplified } from '../../services/AuthProviderSimplified'
import { LocalAppWatcher } from '../../services/LocalAppWatcher'
import { telemetryService } from '../../services/telemetry'
import { telemetryRecorder } from '../../services/telemetry-v2'
import {
    handleCodeFromInsertAtCursor,
    handleCodeFromSaveToNewFile,
    handleCopiedCode,
} from '../../services/utils/codeblock-action-tracker'
import { openExternalLinks, openFilePath, openLocalFileWithRange } from '../../services/utils/workspace-action'
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

export interface SidebarChatWebview extends Omit<vscode.Webview, 'postMessage'> {
    postMessage(message: ExtensionMessage): Thenable<boolean>
}

export interface SidebarChatOptions extends MessageProviderOptions {
    extensionUri: vscode.Uri
}

export class SidebarChatProvider extends MessageProvider implements vscode.WebviewViewProvider {
    private extensionUri: vscode.Uri
    private contextFilesQueryCancellation?: vscode.CancellationTokenSource
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
            case 'submit':
                return this.onHumanMessageSubmitted(message.text, message.submitType, message.contextFiles)
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
                break
            case 'executeRecipe':
                await this.setWebviewView('chat')
                await this.executeRecipe(message.recipe, '', 'chat')
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
            case 'getUserContext':
                await this.handleContextFiles(message.query)
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
            case 'custom-prompt':
                await this.onCustomPromptClicked(message.title, message.value)
                break
            case 'reload':
                await this.authProvider.reloadAuthStatus()
                telemetryService.log('CodyVSCodeExtension:authReloadButton:clicked', undefined, { hasV2Event: true })
                telemetryRecorder.recordEvent('cody.authReloadButton', 'clicked')
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
            case 'simplified-onboarding':
                if (message.type === 'install-app') {
                    void this.simplifiedOnboardingInstallApp()
                    break
                }
                if (message.type === 'open-app') {
                    void openExternalLinks(APP_REPOSITORIES_URL.href)
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
        await openExternalLinks(DOWNLOAD_URL)
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

    private async onHumanMessageSubmitted(
        text: string,
        submitType: ChatSubmitType,
        contextFiles?: ContextFile[],
        addEnhancedContext = true
    ): Promise<void> {
        logDebug('ChatPanelProvider:onHumanMessageSubmitted', 'chat', { verbose: { text, submitType } })

        MessageProvider.inputHistory.push(text)

        if (submitType === 'suggestion') {
            const args = { requestID: this.currentRequestID }
            telemetryService.log('CodyVSCodeExtension:chatPredictions:used', args, { hasV2Event: true })
        }

        return this.executeRecipe('chat-question', text, 'chat', contextFiles, addEnhancedContext)
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

    protected handleCodyCommands(prompts: [string, CodyPrompt][]): void {
        void this.webview?.postMessage({
            type: 'custom-prompts',
            prompts,
        })
    }

    private async handleContextFiles(query: string): Promise<void> {
        if (!query.length) {
            const tabs = getOpenTabsContextFile()
            await this.webview?.postMessage({
                type: 'userContextFiles',
                context: tabs,
            })
            return
        }

        const debouncedContextFilesQuery = debounce(async (query: string): Promise<void> => {
            if (this.contextFilesQueryCancellation) {
                // this.contextFilesQueryCancellation.cancel()
            }
            this.contextFilesQueryCancellation = new vscode.CancellationTokenSource()

            try {
                const MAX_RESULTS = 20
                if (query.startsWith('#')) {
                    const symbolResults = await getSymbolContextFiles(query.slice(1), MAX_RESULTS)
                    await this.webview?.postMessage({
                        type: 'userContextFiles',
                        context: symbolResults,
                    })
                } else {
                    const fileResults = await getFileContextFiles(
                        query,
                        MAX_RESULTS,
                        this.contextFilesQueryCancellation.token
                    )
                    await this.webview?.postMessage({
                        type: 'userContextFiles',
                        context: fileResults,
                    })
                }
            } catch (error) {
                // Handle or log the error as appropriate
                console.error('Error retrieving context files:', error)
            }
        }, 100)

        await debouncedContextFilesQuery(query)
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

        // Register to receive messages from webview
        this.disposables.push(webviewView.webview.onDidReceiveMessage(message => this.onDidReceiveMessage(message)))
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
}
