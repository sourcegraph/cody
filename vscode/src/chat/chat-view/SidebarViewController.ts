import type * as vscode from 'vscode'
import type { startTokenReceiver } from '../../auth/token-receiver'
import type { MessageProviderOptions } from '../MessageProvider'
import type { ExtensionMessage } from '../protocol'

export interface SidebarChatWebview extends Omit<vscode.Webview, 'postMessage'> {
    postMessage(message: ExtensionMessage): Thenable<boolean>
}

export interface SidebarViewOptions extends MessageProviderOptions {
    extensionUri: vscode.Uri
    startTokenReceiver?: typeof startTokenReceiver
}
