import * as vscode from 'vscode'

import { CustomCommandType } from '@sourcegraph/cody-shared/src/chat/prompts'
import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'

import { View } from '../../../webviews/NavBar'
import { WebviewMessage } from '../protocol'

import { addWebviewViewHTML } from './ChatManager'
import { ChatViewProviderWebview } from './ChatPanelProvider'
import { IChatPanelProvider } from './ChatPanelsManager'
import { SimpleChatModel } from './SimpleChatModel'

interface SimpleChatPanelProviderOptions {
    extensionUri: vscode.Uri
}

export class SimpleChatPanelProvider implements vscode.Disposable, IChatPanelProvider {
    private simpleChatModel: SimpleChatModel = new SimpleChatModel()
    public webviewPanel?: vscode.WebviewPanel
    public webview?: ChatViewProviderWebview
    private extensionUri: vscode.Uri
    private disposables: vscode.Disposable[] = []

    constructor({ extensionUri }: SimpleChatPanelProviderOptions) {
        this.extensionUri = extensionUri
    }
    public executeRecipe(recipeID: RecipeID, chatID: string, context: any): Promise<void> {
        console.log('# TODO: executeRecipe')
        return Promise.resolve()
    }
    public executeCustomCommand(title: string, type?: CustomCommandType | undefined): Promise<void> {
        console.log('# TODO: executeCustomCommand')
        return Promise.resolve()
    }
    public clearAndRestartSession(): Promise<void> {
        console.log('# TODO: clearAndRestartSession')
        return Promise.resolve()
    }
    public clearChatHistory(chatID: string): Promise<void> {
        console.log('# TODO: clearChatHistory')
        return Promise.resolve()
    }
    public triggerNotice(notice: { key: string }): void {
        console.log('# TODO: triggerNotice')
    }
    public sessionID = 'TODO'
    public async setWebviewView(view: View): Promise<void> {
        await this.webview?.postMessage({
            type: 'view',
            messages: view,
        })

        if (!this.webviewPanel) {
            await this.createWebviewPanel(this.sessionID)
        }
        this.webviewPanel?.reveal()
    }

    public dispose(): void {
        this.disposables.forEach(disposable => disposable.dispose())
        this.disposables = []
    }

    public restoreSession(chatID: string): Promise<void> {
        console.log('# TODO: restoreSession')
        return Promise.resolve()
    }

    private onDidReceiveMessage(message: WebviewMessage): void {
        // NEXT: add case for 'ready' message, probably should copy over a lot of the old
        // messages from ChatPanelProvider
        console.log('# received message', message)
    }

    /**
     * Creates the webview panel for the Cody chat interface if it doesn't already exist.
     */
    public async createWebviewPanel(chatID?: string, lastQuestion?: string): Promise<vscode.WebviewPanel | undefined> {
        // Checks if the webview panel already exists and is visible.
        // If so, returns early to avoid creating a duplicate.
        if (this.webviewPanel) {
            return this.webviewPanel
        }

        const viewType = 'cody.chatPanel'
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

        // Dispose panel when the panel is closed
        panel.onDidDispose(() => {
            this.webviewPanel = undefined
            panel.dispose()
        })

        this.disposables.push(panel.webview.onDidReceiveMessage(message => this.onDidReceiveMessage(message)))

        return panel
    }
}
