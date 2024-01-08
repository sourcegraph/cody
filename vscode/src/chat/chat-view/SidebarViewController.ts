import * as vscode from 'vscode'

import { DOTCOM_URL } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'

import { View } from '../../../webviews/NavBar'
import { logDebug } from '../../log'
import { AuthProviderSimplified } from '../../services/AuthProviderSimplified'
import { telemetryService } from '../../services/telemetry'
import { telemetryRecorder } from '../../services/telemetry-v2'
import { openExternalLinks } from '../../services/utils/workspace-action'
import { MessageErrorType, MessageProvider, MessageProviderOptions } from '../MessageProvider'
import { ExtensionMessage, WebviewMessage } from '../protocol'

import { addWebviewViewHTML } from './ChatManager'

export interface SidebarChatWebview extends Omit<vscode.Webview, 'postMessage'> {
    postMessage(message: ExtensionMessage): Thenable<boolean>
}

export interface SidebarViewOptions extends MessageProviderOptions {
    extensionUri: vscode.Uri
}

export class SidebarViewController extends MessageProvider implements vscode.WebviewViewProvider {
    private extensionUri: vscode.Uri
    public webview?: SidebarChatWebview
    public webviewPanel: vscode.WebviewPanel | undefined = undefined

    constructor({ extensionUri, ...options }: SidebarViewOptions) {
        super(options)
        this.extensionUri = extensionUri
    }

    private async onDidReceiveMessage(message: WebviewMessage): Promise<void> {
        switch (message.command) {
            case 'ready':
                await this.contextProvider.syncAuthStatus()
                break
            case 'initialized':
                logDebug('SidebarViewController:onDidReceiveMessage', 'initialized')
                await this.setWebviewView('chat')
                await this.init()
                break
            case 'auth':
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
            case 'reload':
                await this.authProvider.reloadAuthStatus()
                telemetryService.log('CodyVSCodeExtension:authReloadButton:clicked', undefined, { hasV2Event: true })
                telemetryRecorder.recordEvent('cody.authReloadButton', 'clicked')
                break
            case 'event':
                telemetryService.log(message.eventName, message.properties)
                break
            case 'links':
                void openExternalLinks(message.value)
                break
            case 'simplified-onboarding':
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
            case 'show-page':
                await vscode.commands.executeCommand('show-page', message.page)
                break
            default:
                this.handleError(new Error('Invalid request type from Webview'), 'system')
        }
    }

    public async simplifiedOnboardingReloadEmbeddingsState(): Promise<void> {
        await this.contextProvider.forceUpdateCodebaseContext()
    }

    protected handleTranscript(): void {
        // not required for non-chat view
    }

    protected handleSuggestions(): void {
        // not required for non-chat view
    }

    protected handleHistory(): void {
        // not required for non-chat view
    }

    /**
     * Display error message in webview as a banner alongside the chat.
     */
    public handleError(error: Error, type: MessageErrorType): void {
        if (type === 'transcript') {
            // not required for non-chat view
            return
        }
        void this.webview?.postMessage({ type: 'errors', errors: error.toString() })
    }

    protected handleCodyCommands(): void {
        // not required for non-chat view
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
     * create webview resources for Auth page
     */
    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _context: vscode.WebviewViewResolveContext<unknown>,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _token: vscode.CancellationToken
    ): Promise<void> {
        this.webview = webviewView.webview
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
}
