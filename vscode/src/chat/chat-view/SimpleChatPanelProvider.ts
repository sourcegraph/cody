import * as vscode from 'vscode'

import { ChatMessage } from '@sourcegraph/cody-shared'
import { ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
import { CustomCommandType } from '@sourcegraph/cody-shared/src/chat/prompts'
import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { EmbeddingsSearch } from '@sourcegraph/cody-shared/src/embeddings'
import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'
import { isError } from '@sourcegraph/cody-shared/src/utils'

import { View } from '../../../webviews/NavBar'
import { getFullConfig } from '../../configuration'
import { logDebug } from '../../log'
import { AuthProvider } from '../../services/AuthProvider'
import { ConfigurationSubsetForWebview, LocalEnv, WebviewMessage } from '../protocol'

import { addWebviewViewHTML } from './ChatManager'
import { ChatViewProviderWebview } from './ChatPanelProvider'
import { IChatPanelProvider } from './ChatPanelsManager'
import { ContextItem, GPT4PromptMaker, PromptMaker, SimpleChatModel } from './SimpleChatModel'

interface SimpleChatPanelProviderOptions {
    extensionUri: vscode.Uri
    authProvider: AuthProvider
    chatClient: ChatClient
    embeddingsClient: EmbeddingsSearch | null
}

export class SimpleChatPanelProvider implements vscode.Disposable, IChatPanelProvider {
    private chatModel: SimpleChatModel = new SimpleChatModel()
    public webviewPanel?: vscode.WebviewPanel
    public webview?: ChatViewProviderWebview
    private extensionUri: vscode.Uri
    private disposables: vscode.Disposable[] = []
    private authProvider: AuthProvider

    private promptMaker: PromptMaker = new GPT4PromptMaker() // TODO: make setable/configurable
    private chatClient: ChatClient

    private embeddingsClient: EmbeddingsSearch | null

    constructor({ extensionUri, authProvider, chatClient, embeddingsClient }: SimpleChatPanelProviderOptions) {
        this.extensionUri = extensionUri
        this.authProvider = authProvider
        this.chatClient = chatClient
        this.embeddingsClient = embeddingsClient
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

    private async onDidReceiveMessage(message: WebviewMessage): Promise<void> {
        switch (message.command) {
            case 'ready':
                // The web view is ready to receive events. We need to make sure that it has an up
                // to date config, even if it was already published
                await this.authProvider.announceNewAuthStatus()
                await this.updateViewConfig()
                break
            // case 'initialized':
            //     logDebug('ChatPanelProvider:onDidReceiveMessage', 'initialized')
            //     await this.init(this.startUpChatID)
            //     this.handleChatModel()
            //     break
            case 'submit':
                await this.onHumanMessageSubmitted(message.text, message.submitType)
                break
            // case 'edit':
            //     this.transcript.removeLastInteraction()
            //     await this.onHumanMessageSubmitted(message.text, 'user')
            //     telemetryService.log('CodyVSCodeExtension:editChatButton:clicked', undefined, { hasV2Event: true })
            //     telemetryRecorder.recordEvent('cody.editChatButton', 'clicked')
            //     break
            // case 'abort':
            //     await this.abortCompletion()
            //     telemetryService.log(
            //         'CodyVSCodeExtension:abortButton:clicked',
            //         { source: 'sidebar' },
            //         { hasV2Event: true }
            //     )
            //     telemetryRecorder.recordEvent('cody.sidebar.abortButton', 'clicked')
            //     break
            // case 'chatModel':
            //     this.chatModel = message.model
            //     this.transcript.setChatModel(message.model)
            //     break
            // case 'executeRecipe':
            //     await this.executeRecipe(message.recipe, '', 'chat')
            //     break
            // case 'custom-prompt':
            //     await this.onCustomPromptClicked(message.title, message.value)
            //     break
            // case 'insert':
            //     await handleCodeFromInsertAtCursor(message.text, message.metadata)
            //     break
            // case 'newFile':
            //     handleCodeFromSaveToNewFile(message.text, message.metadata)
            //     await this.editor.createWorkspaceFile(message.text)
            //     break
            // case 'copy':
            //     await handleCopiedCode(message.text, message.eventType === 'Button', message.metadata)
            //     break
            // case 'event':
            //     telemetryService.log(message.eventName, message.properties)
            //     break
            // case 'links':
            //     void openExternalLinks(message.value)
            //     break
            // case 'openFile':
            //     await openFilePath(message.filePath, this.webviewPanel?.viewColumn)
            //     break
            // case 'openLocalFileWithRange':
            //     await openLocalFileWithRange(message.filePath, message.range)
            //     break
            // default:
            //     this.handleError('Invalid request type from Webview Panel', 'system')
        }
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
        this.webview = panel.webview
        // TODO(beyang): seems weird to set webview here -- is authProvider shared?
        this.authProvider.webview = panel.webview

        // Dispose panel when the panel is closed
        panel.onDidDispose(() => {
            this.webviewPanel = undefined
            panel.dispose()
        })

        this.disposables.push(panel.webview.onDidReceiveMessage(message => this.onDidReceiveMessage(message)))

        return panel
    }

    private async updateViewConfig(): Promise<void> {
        const config = await getFullConfig()
        const authStatus = this.authProvider.getAuthStatus()
        const localProcess = await this.authProvider.appDetector.getProcessInfo(authStatus.isLoggedIn)
        const configForWebview: ConfigurationSubsetForWebview & LocalEnv = {
            ...localProcess,
            debugEnable: config.debugEnable,
            serverEndpoint: config.serverEndpoint,
            experimentalChatPanel: config.experimentalChatPanel,
        }
        await this.webview?.postMessage({ type: 'config', config: configForWebview, authStatus })
        logDebug('SimpleChatPanelProvider', 'updateViewConfig', { verbose: configForWebview })
    }

    private async onHumanMessageSubmitted(text: string, submitType: 'user' | 'suggestion' | 'example'): Promise<void> {
        this.chatModel.addHumanMessage({ text })
        void this.updateTranscript()

        const contextItems: ContextItem[] = []
        if (this.embeddingsClient) {
            console.log('debug: fetching embeddings')
            const embeddings = await this.embeddingsClient.search(text, 2, 2)
            if (isError(embeddings)) {
                console.error('# TODO: embeddings error', embeddings)
            } else {
                for (const codeResult of embeddings.codeResults) {
                    const uri = vscode.Uri.from({
                        scheme: 'file',
                        path: codeResult.fileName,
                        fragment: `${codeResult.startLine}:${codeResult.endLine}`,
                    })
                    const range = new vscode.Range(
                        new vscode.Position(codeResult.startLine, 0),
                        new vscode.Position(codeResult.endLine, 0)
                    )
                    contextItems.push({
                        uri,
                        range,
                        text: codeResult.content,
                    })
                }

                for (const textResult of embeddings.textResults) {
                    const uri = vscode.Uri.from({
                        scheme: 'file',
                        path: textResult.fileName,
                        fragment: `${textResult.startLine}:${textResult.endLine}`,
                    })
                    const range = new vscode.Range(
                        new vscode.Position(textResult.startLine, 0),
                        new vscode.Position(textResult.endLine, 0)
                    )
                    contextItems.push({
                        uri,
                        range,
                        text: textResult.content,
                    })
                }
            }
            console.log('debug: finished fetching embeddings', embeddings)
        }

        const promptMessages = this.promptMaker.makePrompt(this.chatModel, contextItems).map(m => ({
            speaker: m.speaker,
            text: m.text,
            displayText: m.text,
        }))

        let lastContent = ''
        const abort = this.chatClient.chat(
            promptMessages,
            {
                onChange: (content: string) => {
                    console.log('# onChange', content)
                    lastContent = content
                    void this.updateTranscript({
                        speaker: 'assistant',
                        text: content,
                        displayText: content,
                    })
                },
                onComplete: () => {
                    console.log('# onComplete', lastContent)
                    this.chatModel.addBotMessage({ text: lastContent })
                    void this.updateTranscript()
                },
                onError: error => {
                    console.error('TODO: handle error', error)
                },
            },
            {
                model: 'openai/gpt-4-1106-preview',
            }
        )

        return Promise.resolve()
    }

    private async updateTranscript(messageInProgress?: ChatMessage): Promise<void> {
        const newMessages: ChatMessage[] = this.chatModel.messages.map(m => toViewMessage(m))
        if (messageInProgress) {
            newMessages.push(messageInProgress)
        }
        await this.webview?.postMessage({
            type: 'transcript',
            messages: newMessages,
            isMessageInProgress: !!messageInProgress,
        })
    }
}

function toViewMessage(message: Message): ChatMessage {
    return {
        ...message,
        displayText: message.text,
    }
}
