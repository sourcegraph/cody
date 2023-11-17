import { debounce } from 'lodash'
import * as vscode from 'vscode'

import { ActiveTextEditorSelectionRange, ChatMessage, ContextFile } from '@sourcegraph/cody-shared'
import { ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
import { CustomCommandType } from '@sourcegraph/cody-shared/src/chat/prompts'
import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { Typewriter } from '@sourcegraph/cody-shared/src/chat/typewriter'
import { Editor } from '@sourcegraph/cody-shared/src/editor'
import { EmbeddingsSearch } from '@sourcegraph/cody-shared/src/embeddings'
import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'
import { isError } from '@sourcegraph/cody-shared/src/utils'

import { View } from '../../../webviews/NavBar'
import { getFullConfig } from '../../configuration'
import { getFileContextFile, getOpenTabsContextFile, getSymbolContextFile } from '../../editor/utils/editor-context'
import { VSCodeEditor } from '../../editor/vscode-editor'
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
    editor: VSCodeEditor
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

    private readonly editor: VSCodeEditor

    constructor({ extensionUri, authProvider, chatClient, embeddingsClient, editor }: SimpleChatPanelProviderOptions) {
        this.extensionUri = extensionUri
        this.authProvider = authProvider
        this.chatClient = chatClient
        this.embeddingsClient = embeddingsClient
        this.editor = editor
    }
    public executeRecipe(recipeID: RecipeID, chatID: string, context: any): Promise<void> {
        console.log('# TODO: executeRecipe')
        return Promise.resolve()
    }
    public executeCustomCommand(title: string, type?: CustomCommandType | undefined): Promise<void> {
        console.log('# TODO: executeCustomCommand')
        return Promise.resolve()
    }
    public async clearAndRestartSession(): Promise<void> {
        console.log('# TODO: clearAndRestartSession')
        if (this.chatModel.isEmpty()) {
            return Promise.resolve()
        }
        await this.reset()
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
        console.log('# onDidReceiveMessage', message.command)
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
                await this.onHumanMessageSubmitted(
                    message.text,
                    message.submitType,
                    message.contextFiles,
                    message.addEnhancedContext
                )
                break
            case 'getUserContext':
                await this.handleContextFiles(message.query)
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

    private async onHumanMessageSubmitted(
        text: string,
        submitType: 'user' | 'suggestion' | 'example',
        userContextFiles?: ContextFile[],
        addEnhancedContext = true
    ): Promise<void> {
        this.chatModel.addHumanMessage({ text })
        // TODO(beyang): may want to preserve old user context.
        // This means we may want to track user context per message in the model.
        const userContextItems = await contextFilesToContextItems(this.editor, userContextFiles || [])
        this.chatModel.setUserContext(userContextItems)
        void this.updateViewTranscript(undefined, userContextFiles)

        const contextItems: ContextItem[] = [...userContextItems]
        // TODO: only fetch context on first message
        if (this.embeddingsClient && addEnhancedContext) {
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

        this.chatModel.setEnhancedContext(contextItems)
        void this.updateViewTranscript(undefined, userContextFiles)

        const promptMessages = this.promptMaker.makePrompt(this.chatModel, contextItems).map(m => ({
            speaker: m.speaker,
            text: m.text,
            displayText: m.text,
        }))

        let lastContent = ''
        const typewriter = new Typewriter({
            update: content => {
                // const displayText = reformatBotMessage(content, '')
                lastContent = content
                void this.updateViewTranscript(
                    {
                        speaker: 'assistant',
                        text: content,
                        // TODO(beyang): set display text as content? does reformatting affect future response quality?
                        displayText: content,
                    },
                    userContextFiles
                )
            },
            close: () => {
                this.chatModel.addBotMessage({ text: lastContent })
                void this.updateViewTranscript(undefined, userContextFiles)
            },
        })

        const abort = this.chatClient.chat(
            promptMessages,
            {
                onChange: (content: string) => {
                    typewriter.update(content)
                },
                onComplete: () => {
                    typewriter.close()
                    typewriter.stop()

                    // TODO(beyang): guardrails annotate attributions
                    // TODO(beyang): count lines of generated code
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

    // Handler to fetch context files candidates
    private async handleContextFiles(query: string): Promise<void> {
        if (!query.length) {
            const tabs = getOpenTabsContextFile()
            await this.webview?.postMessage({
                type: 'userContextFiles',
                context: tabs,
            })
            return
        }

        const debouncedContextFileQuery = debounce(async (query: string): Promise<void> => {
            try {
                const MAX_RESULTS = 10
                const fileResultsPromise = getFileContextFile(query, MAX_RESULTS)
                const symbolResultsPromise = getSymbolContextFile(query, MAX_RESULTS)

                const [fileResults, symbolResults] = await Promise.all([fileResultsPromise, symbolResultsPromise])
                const context = [...new Set([...fileResults, ...symbolResults])]

                await this.webview?.postMessage({
                    type: 'userContextFiles',
                    context,
                })
            } catch (error) {
                // Handle or log the error as appropriate
                console.error('Error retrieving context files:', error)
            }
        }, 100)

        await debouncedContextFileQuery(query)
    }

    private async updateViewTranscript(
        messageInProgress?: ChatMessage,
        userContextFiles?: ContextFile[]
    ): Promise<void> {
        const newMessages: ChatMessage[] = this.chatModel.getMessages().map(m => toViewMessage(m))
        if (messageInProgress) {
            newMessages.push(messageInProgress)
        }

        const contextFiles: ContextFile[] = []
        if (userContextFiles) {
            contextFiles.push(...userContextFiles)
        }

        const additionalContextFiles = contextItemsToContextFiles(this.chatModel.getEnhancedContext())
        if (newMessages.length > 0) {
            newMessages[0].contextFiles = additionalContextFiles
        }

        await this.webview?.postMessage({
            type: 'transcript',
            messages: newMessages,
            isMessageInProgress: !!messageInProgress,
        })
    }

    private async reset(): Promise<void> {
        this.chatModel = new SimpleChatModel()
        await this.updateViewTranscript()
    }
}

function toViewMessage(message: Message): ChatMessage {
    return {
        ...message,
        displayText: message.text,
    }
}

function contextItemsToContextFiles(items: ContextItem[]): ContextFile[] {
    const contextFiles: ContextFile[] = []
    for (const item of items) {
        console.log('# item.range', item.range)
        contextFiles.push({
            fileName: item.uri.fsPath,
            source: 'embeddings',
            range: rangeToViewRange(item.range),

            // TODO: repoName + revision?
        })
    }
    return contextFiles
}

function contextFilesToContextItems(editor: Editor, files: ContextFile[]): Promise<ContextItem[]> {
    return Promise.all(
        files.map(async (file: ContextFile): Promise<ContextItem> => {
            const range = viewRangeToRange(file.range)
            if (!file.uri) {
                throw new Error('contextFilesToContextItems: uri undefined on ContextFile')
            }
            return {
                uri: file.uri,
                range,
                text: file.content || (await editor.getTextEditorContentForFile(file.uri, range)) || '',
            }
        })
    )
}

function rangeToViewRange(range?: vscode.Range): ActiveTextEditorSelectionRange | undefined {
    if (!range) {
        return undefined
    }
    return {
        start: {
            line: range.start.line,
            character: range.start.character,
        },
        end: {
            line: range.end.line,
            character: range.end.character,
        },
    }
}

function viewRangeToRange(range?: ActiveTextEditorSelectionRange): vscode.Range | undefined {
    if (!range) {
        return undefined
    }
    return new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character)
}
