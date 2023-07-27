import * as vscode from 'vscode'

import { ChatMessage, UserLocalHistory } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { View } from '../../webviews/NavBar'
import { debug } from '../log'
import { CodyPromptType } from '../my-cody/types'

import { MessageProvider, MessageProviderOptions } from './MessageProvider'
import { ExtensionMessage, WebviewMessage } from './protocol'

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
    }

    private async onDidReceiveMessage(message: WebviewMessage): Promise<void> {
        switch (message.command) {
            case 'ready':
                // The web view is ready to receive events. We need to make sure that it has an up
                // to date config, even if it was already published
                await this.authProvider.announceNewAuthStatus()
                break
            case 'initialized':
                debug('ChatViewProvider:onDidReceiveMessage:initialized', '')
                await this.init()
                break
            case 'submit':
                await this.onHumanMessageSubmitted(message.text, message.submitType)
                break
            case 'edit':
                this.transcript.removeLastInteraction()
                await this.onHumanMessageSubmitted(message.text, 'user')
                break
            case 'abort':
                await this.abortCompletion()
                break
            case 'executeRecipe':
                this.showTab('chat')
                await this.executeRecipe(message.recipe)
                break
            case 'auth':
                if (message.type === 'app' && message.endpoint) {
                    await this.authProvider.appAuth(message.endpoint)
                    // Log app button click events: e.g. app:download:clicked or app:connect:clicked
                    const value = message.value === 'download' ? 'app:download' : 'app:connect'
                    this.telemetryService.log(`CodyVSCodeExtension:${value}:clicked`) // TODO(sqs): remove when new events are working
                    break
                }
                if (message.type === 'callback' && message.endpoint) {
                    await this.authProvider.redirectToEndpointLogin(message.endpoint)
                    break
                }
                // cody.auth.signin or cody.auth.signout
                await vscode.commands.executeCommand(`cody.auth.${message.type}`)
                break
            case 'insert':
                await this.insertAtCursor(message.text)
                break
            case 'event':
                this.telemetryService.log(message.eventName, message.properties)
                break
            case 'removeHistory':
                await this.clearHistory()
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
            case 'my-prompt':
                await this.onCustomRecipeClicked(message.title, message.value)
                break
            case 'reload':
                await this.authProvider.reloadAuthStatus()
                break
            case 'openFile': {
                const rootUri = this.editor.getWorkspaceRootUri()
                if (!rootUri) {
                    this.handleError('Failed to open file: missing rootUri')
                    return
                }
                try {
                    // This opens the file in the active column.
                    const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(rootUri, message.filePath))
                    await vscode.window.showTextDocument(doc)
                } catch {
                    // Try to open the file in the sourcegraph view
                    const sourcegraphSearchURL = new URL(
                        `/search?q=context:global+file:${message.filePath}`,
                        this.contextProvider.config.serverEndpoint
                    ).href
                    void this.openExternalLinks(sourcegraphSearchURL)
                }
                break
            }
            case 'chat-button': {
                switch (message.action) {
                    case 'explain-code-high-level':
                    case 'find-code-smells':
                    case 'generate-unit-test':
                        void this.executeRecipe(message.action)
                        break
                    default:
                        break
                }
                break
            }
            case 'setEnabledPlugins':
                await this.localStorage.setEnabledPlugins(message.plugins)
                this.handleEnabledPlugins(message.plugins)
                break
            default:
                this.handleError('Invalid request type from Webview')
        }
    }

    private async onHumanMessageSubmitted(text: string, submitType: 'user' | 'suggestion'): Promise<void> {
        debug('ChatViewProvider:onHumanMessageSubmitted', '', { verbose: { text, submitType } })
        if (submitType === 'suggestion') {
            this.telemetryService.log('CodyVSCodeExtension:chatPredictions:used')
        }
        MessageProvider.inputHistory.push(text)
        if (this.contextProvider.config.experimentalChatPredictions) {
            void this.runRecipeForSuggestion('next-questions', text)
        }
        await this.executeCommands(text, 'chat-question')
    }

    /**
     * Process custom recipe click
     */
    private async onCustomRecipeClicked(title: string, recipeType: CodyPromptType = 'user'): Promise<void> {
        this.telemetryService.log('CodyVSCodeExtension:custom-recipe:clicked')
        debug('ChatViewProvider:onCustomRecipeClicked', title)
        if (!this.isCustomRecipeAction(title)) {
            this.showTab('chat')
        }
        await this.executeCustomRecipe(title, recipeType)
    }

    public showTab(tab: string): void {
        void vscode.commands.executeCommand('cody.chat.focus')
        void this.webview?.postMessage({ type: 'showTab', tab })
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
     * Display error message in webview view as banner in chat view
     * It does not display error message as assistant response
     */
    public handleError(errorMsg: string): void {
        void this.webview?.postMessage({ type: 'errors', errors: errorMsg })
    }

    /**
     * Insert text at cursor position
     * Replace selection if there is one
     * Note: Using workspaceEdit instead of 'editor.action.insertSnippet' as the later reformats the text incorrectly
     */
    private async insertAtCursor(text: string): Promise<void> {
        const selectionRange = vscode.window.activeTextEditor?.selection
        const editor = vscode.window.activeTextEditor
        if (!editor || !selectionRange) {
            return
        }
        const edit = new vscode.WorkspaceEdit()
        // trimEnd() to remove new line added by Cody
        edit.replace(editor.document.uri, selectionRange, text.trimEnd())
        await vscode.workspace.applyEdit(edit)
    }

    protected handleEnabledPlugins(plugins: string[]): void {
        void this.webview?.postMessage({ type: 'enabled-plugins', plugins })
    }

    protected handleMyPrompts(prompts: string[], isEnabled: boolean): void {
        void this.webview?.postMessage({
            type: 'my-prompts',
            prompts,
            isEnabled,
        })
    }

    /**
     * Set webview view
     */
    public setWebviewView(view: View): void {
        void vscode.commands.executeCommand('cody.chat.focus')
        void this.webview?.postMessage({
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
