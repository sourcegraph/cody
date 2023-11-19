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
import { telemetryService } from '../../services/telemetry'
import { telemetryRecorder } from '../../services/telemetry-v2'
import { ConfigurationSubsetForWebview, getChatModelsForWebview, LocalEnv, WebviewMessage } from '../protocol'

import { addWebviewViewHTML } from './ChatManager'
import { ChatViewProviderWebview } from './ChatPanelProvider'
import { IChatPanelProvider } from './ChatPanelsManager'
import { ContextItem, ContextMessage, GPT4PromptMaker, PromptMaker, SimpleChatModel } from './SimpleChatModel'

interface SimpleChatPanelProviderOptions {
    extensionUri: vscode.Uri
    authProvider: AuthProvider
    chatClient: ChatClient
    embeddingsClient: EmbeddingsSearch | null
    editor: VSCodeEditor
}

export class SimpleChatPanelProvider implements vscode.Disposable, IChatPanelProvider {
    private chatModel: SimpleChatModel = new SimpleChatModel()
    private modelID = 'anthropic/claude-2'

    public webviewPanel?: vscode.WebviewPanel
    public webview?: ChatViewProviderWebview

    private extensionUri: vscode.Uri
    private disposables: vscode.Disposable[] = []
    private authProvider: AuthProvider

    private promptMaker: PromptMaker = new GPT4PromptMaker() // TODO: make setable/configurable
    private chatClient: ChatClient

    private embeddingsClient: EmbeddingsSearch | null

    private readonly editor: VSCodeEditor

    private completionCanceller?: () => void
    private cancelInProgressCompletion(): void {
        if (this.completionCanceller) {
            this.completionCanceller()
            this.completionCanceller = undefined
        }
    }

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
            case 'initialized':
                logDebug('SimpleChatPanelProvider:onDidReceiveMessage', 'initialized')
                // await this.init(this.startUpChatID)
                this.onInitialized()
                break
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
            case 'abort':
                this.cancelInProgressCompletion()
                telemetryService.log(
                    'CodyVSCodeExtension:abortButton:clicked',
                    { source: 'sidebar' },
                    { hasV2Event: true }
                )
                telemetryRecorder.recordEvent('cody.sidebar.abortButton', 'clicked')
                break
            case 'chatModel':
                this.modelID = message.model
                break
            // case 'executeRecipe':
            //     await this.executeRecipe(message.recipe, '', 'chat')
            //     break
            // case 'custom-prompt':
            //     await this.onCustomPromptClicked(message.title, message.value)
            //     break
            case 'event':
                telemetryService.log(message.eventName, message.properties)
                break
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

    private onInitialized(): void {
        const endpoint = this.authProvider.getAuthStatus()?.endpoint
        const allowedModels = getChatModelsForWebview(endpoint)
        const models = this.chatModel
            ? allowedModels.map(model => {
                  return {
                      ...model,
                      default: model.model === this.modelID,
                  }
              })
            : allowedModels

        void this.webview?.postMessage({
            type: 'chatModels',
            models,
        })
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
        const userContextItems = await contextFilesToContextItems(this.editor, userContextFiles || [])
        this.chatModel.addHumanMessage({ text }, userContextItems)
        void this.updateViewTranscript(undefined, userContextFiles)

        // TODO: only fetch context on first message
        const contextWindowBytes = 28000 // 7000 tokens * 4 bytes per token
        // TODO: display warnings
        const { usedContext, ignoredContext, warnings } = await this.computeContext(
            userContextItems,
            contextWindowBytes
        )

        this.chatModel.setEnhancedContext(usedContext)
        void this.updateViewTranscript(undefined, userContextFiles)

        const promptMessages = this.promptMaker.makePrompt(this.chatModel, usedContext).map(m => ({
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

        this.cancelInProgressCompletion()
        this.completionCanceller = this.chatClient.chat(
            promptMessages,
            {
                onChange: (content: string) => {
                    typewriter.update(content)
                },
                onComplete: () => {
                    this.completionCanceller = undefined
                    typewriter.close()
                    typewriter.stop()

                    // TODO(beyang): guardrails annotate attributions
                    // TODO(beyang): count lines of generated code
                },
                onError: error => {
                    this.completionCanceller = undefined
                    console.error('TODO: handle error', error)
                },
            },
            { model: this.modelID }
        )

        return Promise.resolve()
    }

    private async computeContext(
        userContextItems: ContextItem[],
        byteLimit: number
    ): Promise<{
        usedContext: ContextItem[]
        ignoredContext: ContextItem[]
        warnings: string[]
    }> {
        let bytesUsed = 0
        const usedContext: ContextItem[] = []
        const ignoredContext: ContextItem[] = []
        const warnings: string[] = []

        // // add current selection, or current editor context
        // const selection = this.editor.getActiveTextEditorSelection()
        // if (selection?.selectedText) {
        //     const selectedText = selection.selectedText
        //     const selectedTextLength = selectedText.length
        //     if (selectedTextLength > byteLimit) {
        //         warnings.push(`Ignored selection because it exceeded the byte limit of ${byteLimit} bytes.`)
        //     } else {
        //         usedContext.push({
        //             text: selectedText,
        //             type: 'user',
        //             start: selection.start,
        //             end: selection.end,
        //         })
        //         bytesUsed += selectedTextLength
        //     }
        // } else {
        // }

        for (const item of userContextItems) {
            if (bytesUsed + item.text.length > byteLimit) {
                ignoredContext.push(item)
            } else {
                usedContext.push(item)
                bytesUsed += item.text.length
            }
        }

        if (ignoredContext.length > 0) {
            warnings.push(
                `Ignored ${ignoredContext.length} user context items because they exceeded the byte limit of ${byteLimit} bytes.`
            )
        }

        if (this.embeddingsClient) {
            const embeddingsContext = await this.fetchEmbeddingsContext()
            for (const item of embeddingsContext) {
                if (bytesUsed + item.text.length > byteLimit) {
                    ignoredContext.push(item)
                } else {
                    usedContext.push(item)
                    bytesUsed += item.text.length
                }
            }
        }

        return { usedContext, ignoredContext, warnings }
    }

    private async fetchEmbeddingsContext(): Promise<ContextItem[]> {
        if (!this.embeddingsClient) {
            throw new Error('attempting to fetch embeddings, but no embeddings available')
        }

        const messages = this.chatModel.getMessages()
        const lastMessage = messages.at(-1)
        if (!lastMessage) {
            return []
        }
        if (lastMessage.speaker !== 'human') {
            throw new Error('invalid state: cannot fetch context when last message was not human')
        }
        if (lastMessage.text === undefined) {
            return []
        }

        const text = lastMessage.text
        const contextItems: ContextItem[] = []

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
        return contextItems
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

interface IContextProvider {
    getCurrentSelection(): ContextItem[]
    getVisible(): ContextItem[]
    getEnhancedContext(query: string): Promise<ContextItem[]>
}

class ContextProvider implements IContextProvider {
    constructor(
        private userContext: ContextItem[],
        private editor: Editor,
        private embeddingsClient: EmbeddingsSearch | null
    ) {}

    // TODO: implement max-per-file truncation

    public getCurrentSelection(): ContextItem[] {
        const selection = this.editor.getActiveInlineChatSelection()
        if (!selection) {
            return []
        }
        let range: vscode.Range | undefined
        if (selection.selectionRange) {
            range = new vscode.Range(
                selection.selectionRange.start.line,
                selection.selectionRange.start.character,
                selection.selectionRange.end.line,
                selection.selectionRange.end.character
            )
        }

        return [
            {
                text: selection.selectedText, // TODO: maybe go to nearest line boundaries?
                uri: selection.fileUri || vscode.Uri.file(selection.fileName),
                range,
            },
        ]
    }
    public getVisible(): ContextItem[] {
        const visible = this.editor.getActiveTextEditorVisibleContent()
        if (!visible) {
            return []
        }
        return [
            {
                text: visible.content,
                uri: visible.fileUri || vscode.Uri.file(visible.fileName),
                // TODO(beyang): include range
            },
        ]
    }
    public async getEnhancedContext(text: string): Promise<ContextItem[]> {
        if (!this.embeddingsClient) {
            return []
        }

        console.log('debug: fetching embeddings')
        const contextItems: ContextItem[] = []
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
        return contextItems
    }
    public getUserContext(): ContextItem[] {
        return this.userContext
    }
}

// TODO(beyang): move to separate module?
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class GPT4Prompter {
    public static makePrompt(
        chat: SimpleChatModel,
        contextProvider: ContextProvider,
        byteLimit: number
    ): {
        prompt: Message[]
        warnings: string[]
        fetchedEnhancedContext?: ContextItem[]
    } {
        const { reversePrompt, warnings, fetchedEnhancedContext } = this.makeReversePrompt(
            chat,
            contextProvider,
            byteLimit
        )
        return {
            prompt: [...reversePrompt].reverse(),
            warnings,
            fetchedEnhancedContext,
        }
    }

    private static makeReversePrompt(
        chat: SimpleChatModel,
        contextProvider: ContextProvider,
        byteLimit: number
    ): {
        reversePrompt: Message[]
        warnings: string[]
        fetchedEnhancedContext?: ContextItem[]
    } {
        const promptBuilder = new PromptBuilder(byteLimit)
        const warnings: string[] = []

        // Add existing transcript messages
        const reverseTranscript: ContextMessage[] = [...chat.getMessages()].reverse()
        for (let i = 0; i < reverseTranscript.length; i++) {
            const message = reverseTranscript[i]
            const contextLimitReached = promptBuilder.tryAdd(message)
            if (!contextLimitReached) {
                warnings.push(`Ignored ${reverseTranscript.length - i} transcript messages due to context limit`)
                return {
                    reversePrompt: promptBuilder.reverseMessages,
                    warnings,
                }
            }
        }

        // Add user context for all messages
        for (const message of reverseTranscript) {
            for (const contextItem of message.context) {
                for (const contextMessage of this.renderContextItem(contextItem).reverse()) {
                    const contextLimitReached = promptBuilder.tryAdd(contextMessage)
                    if (!contextLimitReached) {
                        warnings.push('Ignored some user-specified context items due to context limit')
                        return {
                            reversePrompt: promptBuilder.reverseMessages,
                            warnings,
                        }
                    }
                }
            }
        }

        // If not the first message, don't fetch enhanced context or look for a current selection/file
        const firstMessage = chat.getMessages().at(0)
        if (!firstMessage?.text || chat.getMessages().length !== 1) {
            return {
                reversePrompt: promptBuilder.reverseMessages,
                warnings,
            }
        }
        const firstMessageText = firstMessage.text
        // NEXT: current selection patterns (what do we currently do?)

        // TODO: if it's the first message, look at selection or current file
        // (look for key phrases like "this file" or the existence of a selection)

        // TODO: add in context messages (all context goes at the top for now)

        // const userContextItems = contextProvider.getUserContext()
        // for (const item of userContextItems) {
        //     if (bytesUsed + item.text.length > byteLimit) {
        //         ignoredContext.push(item)
        //     } else {
        //         usedContext.push(item)
        //         bytesUsed += item.text.length
        //     }
        // }

        // if (ignoredContext.length > 0) {
        //     warnings.push(
        //         `Ignored ${ignoredContext.length} user context items because they exceeded the byte limit of ${byteLimit} bytes.`
        //     )
        // }

        // if (chat.getMessages().length === 1) {
        //     console.error('# NOT')
        // }

        // TODO(beyang): reverse order
        return {
            reversePrompt: promptBuilder.reverseMessages,
            warnings,
        }
    }

    private static renderContextItem(contextItem: ContextItem): Message[] {
        return []
    }
}

class PromptBuilder {
    public reverseMessages: Message[] = []
    private bytesUsed = 0
    constructor(private readonly byteLimit: number) {}
    public tryAdd(message: Message): boolean {
        // TODO: check for speaker alternation here?

        const msgLen = message.speaker.length + (message.text?.length || 0) + 3 // space and 2 newlines
        if (this.bytesUsed + msgLen > this.byteLimit) {
            return false
        }
        this.reverseMessages.push(message)
        this.bytesUsed += msgLen
        return true
    }
}
