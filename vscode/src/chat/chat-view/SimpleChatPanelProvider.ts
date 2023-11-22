import { debounce } from 'lodash'
import * as vscode from 'vscode'

import { ActiveTextEditorSelectionRange, ChatMessage, ContextFile } from '@sourcegraph/cody-shared'
import { ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
import { CustomCommandType } from '@sourcegraph/cody-shared/src/chat/prompts'
import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { TranscriptJSON } from '@sourcegraph/cody-shared/src/chat/transcript'
import { InteractionJSON } from '@sourcegraph/cody-shared/src/chat/transcript/interaction'
import { UserLocalHistory } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { Typewriter } from '@sourcegraph/cody-shared/src/chat/typewriter'
import { ContextMessage } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { Editor } from '@sourcegraph/cody-shared/src/editor'
import { EmbeddingsSearch } from '@sourcegraph/cody-shared/src/embeddings'
import {
    isMarkdownFile,
    populateCodeContextTemplate,
    populateMarkdownContextTemplate,
} from '@sourcegraph/cody-shared/src/prompt/templates'
import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'
import { isError } from '@sourcegraph/cody-shared/src/utils'

import { View } from '../../../webviews/NavBar'
import { getFullConfig } from '../../configuration'
import { getFileContextFile, getOpenTabsContextFile, getSymbolContextFile } from '../../editor/utils/editor-context'
import { VSCodeEditor } from '../../editor/vscode-editor'
import { logDebug } from '../../log'
import { AuthProvider } from '../../services/AuthProvider'
import { localStorage } from '../../services/LocalStorageProvider'
import { telemetryService } from '../../services/telemetry'
import { telemetryRecorder } from '../../services/telemetry-v2'
import { createCodyChatTreeItems } from '../../services/treeViewItems'
import { TreeViewProvider } from '../../services/TreeViewProvider'
import { ConfigurationSubsetForWebview, getChatModelsForWebview, LocalEnv, WebviewMessage } from '../protocol'

import { addWebviewViewHTML } from './ChatManager'
import { ChatViewProviderWebview } from './ChatPanelProvider'
import { IChatPanelProvider } from './ChatPanelsManager'
import { contextItemsToContextFiles, stripContextWrapper } from './helpers'
import { ContextItem, contextItemId, MessageWithContext, SimpleChatModel } from './SimpleChatModel'

interface SimpleChatPanelProviderOptions {
    extensionUri: vscode.Uri
    authProvider: AuthProvider
    chatClient: ChatClient
    embeddingsClient: EmbeddingsSearch | null
    editor: VSCodeEditor
    treeView: TreeViewProvider
}

class ChatHistoryManager {
    public getChat(sessionID: string): TranscriptJSON | null {
        const chatHistory = localStorage.getChatHistory()
        if (!chatHistory) {
            return null
        }

        return chatHistory.chat[sessionID]
    }

    public async saveChat(chat: TranscriptJSON): Promise<UserLocalHistory> {
        let history = localStorage.getChatHistory()
        if (!history) {
            history = {
                chat: {},
                input: [],
            }
        }
        history.chat[chat.id] = chat
        await localStorage.setChatHistory(history)
        return history
    }
}

export class SimpleChatPanelProvider implements vscode.Disposable, IChatPanelProvider {
    private chatModel: SimpleChatModel = new SimpleChatModel('anthropic/claude-2')

    public webviewPanel?: vscode.WebviewPanel
    public webview?: ChatViewProviderWebview

    private extensionUri: vscode.Uri
    private disposables: vscode.Disposable[] = []
    private authProvider: AuthProvider

    private chatClient: ChatClient

    private embeddingsClient: EmbeddingsSearch | null

    private readonly editor: VSCodeEditor
    private readonly treeView: TreeViewProvider

    private history = new ChatHistoryManager()

    // TODO(beyang): we need awkwardly need to keep this in sync with chatModel.sessionID
    // It is necessary to satisfy the IChatPanelProvider interface
    public sessionID: string

    constructor({
        extensionUri,
        authProvider,
        chatClient,
        embeddingsClient,
        editor,
        treeView,
    }: SimpleChatPanelProviderOptions) {
        this.extensionUri = extensionUri
        this.authProvider = authProvider
        this.chatClient = chatClient
        this.embeddingsClient = embeddingsClient
        this.editor = editor
        this.treeView = treeView
        this.sessionID = this.chatModel.sessionID
    }

    private completionCanceller?: () => void
    private cancelInProgressCompletion(): void {
        if (this.completionCanceller) {
            this.completionCanceller()
            this.completionCanceller = undefined
        }
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

    public async setWebviewView(view: View): Promise<void> {
        await this.webview?.postMessage({
            type: 'view',
            messages: view,
        })

        if (!this.webviewPanel) {
            await this.createWebviewPanel()
        }
        this.webviewPanel?.reveal()
    }

    public dispose(): void {
        this.disposables.forEach(disposable => disposable.dispose())
        this.disposables = []
    }

    public async restoreSession(sessionID: string): Promise<void> {
        // TODO(beyang): save the current chat model
        this.cancelInProgressCompletion()

        const oldTranscript = this.history.getChat(sessionID)
        if (!oldTranscript) {
            throw new Error(`Could not find chat history for sessionID ${sessionID}`)
        }
        const newModel = await newChatModelfromTranscriptJSON(this.editor, oldTranscript)
        this.chatModel = newModel
        this.sessionID = newModel.sessionID

        await this.updateViewTranscript()
    }

    public async saveSession(): Promise<void> {
        const allHistory = await this.history.saveChat(this.chatModel.toTranscriptJSON())
        void this.webview?.postMessage({
            type: 'history',
            messages: allHistory,
        })
        this.treeView.updateTree(createCodyChatTreeItems(allHistory))
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
                this.chatModel.modelID = message.model
                break
            // case 'executeRecipe':
            //     await this.executeRecipe(message.recipe, '', 'chat')
            //     break
            case 'getUserContext':
                await this.handleContextFiles(message.query)
                break
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
            case 'event':
                telemetryService.log(message.eventName, message.properties)
                break
            // case 'links':
            //     void openExternalLinks(message.value)
            //     break
            case 'openFile':
                console.log('# openFile', message)
                // await openFilePath(message.filePath, this.webviewPanel?.viewColumn)
                break
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
                      default: model.model === this.chatModel.modelID,
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
    public async createWebviewPanel(lastQuestion?: string): Promise<vscode.WebviewPanel | undefined> {
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
        const userContextItems = await contextFilesToContextItems(this.editor, userContextFiles || [], true)
        this.chatModel.addHumanMessage({ text })
        void this.updateViewTranscript()

        const contextWindowBytes = 28000 // 7000 tokens * 4 bytes per token

        const contextProvider = new ContextProvider(
            userContextItems,
            this.editor,
            addEnhancedContext ? this.embeddingsClient : null
        )
        const {
            prompt: promptMessages,
            warnings,
            newContextUsed,
        } = await GPT4Prompter.makePrompt(this.chatModel, contextProvider, contextWindowBytes)

        this.chatModel.setNewContextUsed(newContextUsed)

        // TODO: send warnings to client
        console.error('# warnings', warnings)

        void this.updateViewTranscript()

        let lastContent = ''
        const typewriter = new Typewriter({
            update: content => {
                // TODO(beyang): set display text as content? does reformatting affect future response quality?
                // const displayText = reformatBotMessage(content, '')
                lastContent = content
                void this.updateViewTranscript(
                    toViewMessage({
                        message: {
                            speaker: 'assistant',
                            text: content,
                        },
                        newContextUsed,
                    })
                )
            },
            close: () => {
                this.chatModel.addBotMessage({ text: lastContent })
                void this.saveSession()
                void this.updateViewTranscript()
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
            { model: this.chatModel.modelID }
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

    private async updateViewTranscript(messageInProgress?: ChatMessage): Promise<void> {
        const messages: ChatMessage[] = this.chatModel.getMessagesWithContext().map(m => toViewMessage(m))
        if (messageInProgress) {
            messages.push(messageInProgress)
        }

        await this.webview?.postMessage({
            type: 'transcript',
            messages,
            isMessageInProgress: !!messageInProgress,
        })
    }

    private async reset(): Promise<void> {
        await this.saveSession()

        this.chatModel = new SimpleChatModel(this.chatModel.modelID)
        this.sessionID = this.chatModel.sessionID
        await this.updateViewTranscript()
    }
}

function toViewMessage(mwc: MessageWithContext): ChatMessage {
    return {
        ...mwc.message,

        displayText: mwc.message.text,
        contextFiles: contextItemsToContextFiles(mwc.newContextUsed || []),
    }
}

interface IContextProvider {
    getUserAttentionContext(): ContextItem[]
    getEnhancedContext(query: string): Promise<ContextItem[]>
    getUserContext(): ContextItem[]
}

class ContextProvider implements IContextProvider {
    constructor(
        private userContext: ContextItem[],
        private editor: Editor,
        private embeddingsClient: EmbeddingsSearch | null
    ) {}

    // TODO(beyang): implement max-per-file truncation

    public getUserAttentionContext(): ContextItem[] {
        const selectionContext = this.getCurrentSelectionContext()
        if (selectionContext.length > 0) {
            return selectionContext
        }
        return this.getVisibleEditorContext()
    }

    private getCurrentSelectionContext(): ContextItem[] {
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

    private getVisibleEditorContext(): ContextItem[] {
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
            throw new Error('# TODO: reset enhanced context selector when chat is reset')
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
                    scheme: 'cody-embeddings',
                    authority: this.embeddingsClient.repoId,
                    path: '/' + codeResult.fileName,
                    fragment: `L${codeResult.startLine}-${codeResult.endLine}`,
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
    public static async makePrompt(
        chat: SimpleChatModel,
        contextProvider: ContextProvider,
        byteLimit: number
    ): Promise<{
        prompt: Message[]
        warnings: string[]
        newContextUsed: ContextItem[]
    }> {
        const { reversePrompt, warnings, newContextUsed } = await this.makeReversePrompt(
            chat,
            contextProvider,
            byteLimit
        )
        return {
            prompt: [...reversePrompt].reverse(),
            warnings,
            newContextUsed,
        }
    }

    // Constructs the raw prompt to send to the LLM, with message order reversed, so we can construct
    // an array with the most important messages (which appear most important first in the reverse-prompt.
    //
    // Returns the reverse prompt, a list of warnings that indicate that the prompt was truncated, and
    // the new context that was used in the prompt for the current message.
    private static async makeReversePrompt(
        chat: SimpleChatModel,
        contextProvider: ContextProvider,
        byteLimit: number
    ): Promise<{
        reversePrompt: Message[]
        warnings: string[]
        newContextUsed: ContextItem[]
    }> {
        const promptBuilder = new PromptBuilder(byteLimit)
        const newContextUsed: ContextItem[] = []
        const warnings: string[] = []

        // Add existing transcript messages
        const reverseTranscript: MessageWithContext[] = [...chat.getMessagesWithContext()].reverse()
        for (let i = 0; i < reverseTranscript.length; i++) {
            const messageWithContext = reverseTranscript[i]
            const contextLimitReached = promptBuilder.tryAdd(messageWithContext.message)
            if (!contextLimitReached) {
                warnings.push(`Ignored ${reverseTranscript.length - i} transcript messages due to context limit`)
                return {
                    reversePrompt: promptBuilder.reverseMessages,
                    warnings,
                    newContextUsed,
                }
            }
        }

        {
            // Add context from new user-specified context items
            const { limitReached, used } = promptBuilder.tryAddContext(
                contextProvider.getUserContext(),
                (item: ContextItem) => this.renderContextItem(item)
            )
            newContextUsed.push(...used)
            if (limitReached) {
                warnings.push('Ignored current user-specified context items due to context limit')
                return { reversePrompt: promptBuilder.reverseMessages, warnings, newContextUsed }
            }
        }

        {
            // Add context from previous messages
            const { limitReached } = promptBuilder.tryAddContext(
                reverseTranscript.flatMap((message: MessageWithContext) => message.newContextUsed || []),
                (item: ContextItem) => this.renderContextItem(item)
            )
            if (limitReached) {
                warnings.push('Ignored prior context items due to context limit')
                return { reversePrompt: promptBuilder.reverseMessages, warnings, newContextUsed }
            }
        }

        // If not the first message, don't add additional context
        const firstMessageWithContext = chat.getMessagesWithContext().at(0)
        if (!firstMessageWithContext?.message.text || chat.getMessagesWithContext().length !== 1) {
            return {
                reversePrompt: promptBuilder.reverseMessages,
                warnings,
                newContextUsed,
            }
        }

        // Add additional context from current editor or broader search
        const additionalContextItems: ContextItem[] = []
        if (isEditorContextRequired(firstMessageWithContext.message.text)) {
            additionalContextItems.push(...contextProvider.getUserAttentionContext())
        } else {
            additionalContextItems.push(
                ...(await contextProvider.getEnhancedContext(firstMessageWithContext.message.text))
            )
        }
        const { limitReached, used } = promptBuilder.tryAddContext(additionalContextItems, (item: ContextItem) =>
            this.renderContextItem(item)
        )
        newContextUsed.push(...used)
        if (limitReached) {
            warnings.push('Ignored additional context items due to context limit')
        }

        // console.log('# active doc uri:', vscode.window.activeTextEditor?.document.uri)

        return {
            reversePrompt: promptBuilder.reverseMessages,
            warnings,
            newContextUsed,
        }
    }

    private static renderContextItem(contextItem: ContextItem): Message[] {
        let messageText: string
        if (isMarkdownFile(contextItem.uri.fsPath)) {
            // TODO(beyang): pass in repo name?, make fsPath relative to repo root?
            messageText = populateMarkdownContextTemplate(contextItem.text, contextItem.uri.fsPath)
        } else {
            messageText = populateCodeContextTemplate(contextItem.text, contextItem.uri.fsPath)
        }
        return [
            { speaker: 'human', text: messageText },
            { speaker: 'assistant', text: 'Ok.' },
        ]
    }
}

class PromptBuilder {
    public reverseMessages: Message[] = []
    private bytesUsed = 0
    private seenContext = new Set<string>()
    constructor(private readonly byteLimit: number) {}
    public tryAdd(message: Message): boolean {
        // TODO: check for speaker alternation here

        const msgLen = message.speaker.length + (message.text?.length || 0) + 3 // space and 2 newlines
        if (this.bytesUsed + msgLen > this.byteLimit) {
            return false
        }
        this.reverseMessages.push(message)
        this.bytesUsed += msgLen
        return true
    }

    public tryAddContext(
        contextItems: ContextItem[],
        renderContextItem: (contextItem: ContextItem) => Message[]
    ): {
        limitReached: boolean
        used: ContextItem[]
        ignored: ContextItem[]
        duplicate: ContextItem[]
    } {
        let limitReached = false
        const used: ContextItem[] = []
        const ignored: ContextItem[] = []
        const duplicate: ContextItem[] = []
        for (const contextItem of contextItems) {
            const id = contextItemId(contextItem)
            if (this.seenContext.has(id)) {
                duplicate.push(contextItem)
                continue
            }
            const contextMessages = renderContextItem(contextItem).reverse()
            const contextLen = contextMessages.reduce(
                (acc, msg) => acc + msg.speaker.length + (msg.text?.length || 0) + 3,
                0
            )
            if (this.bytesUsed + contextLen > this.byteLimit) {
                ignored.push(contextItem)
                limitReached = true
                continue
            }
            this.seenContext.add(id)
            this.reverseMessages.push(...contextMessages)
            this.bytesUsed += contextLen
            used.push(contextItem)
        }
        return {
            limitReached,
            used,
            ignored,
            duplicate,
        }
    }
}

const editorRegexps = [/editor/, /(open|current|this|entire)\s+file/, /current(ly)?\s+open/, /have\s+open/]

function isEditorContextRequired(input: string): boolean | Error {
    const inputLowerCase = input.toLowerCase()
    // If the input matches any of the `editorRegexps` we assume that we have to include
    // the editor context (e.g., currently open file) to the overall message context.
    for (const regexp of editorRegexps) {
        if (inputLowerCase.match(regexp)) {
            return true
        }
    }
    return false
}

export function contextFilesToContextItems(
    editor: Editor,
    files: ContextFile[],
    fetchContent?: boolean
): Promise<ContextItem[]> {
    return Promise.all(
        files.map(async (file: ContextFile): Promise<ContextItem> => {
            const range = viewRangeToRange(file.range)
            const uri = file.uri || vscode.Uri.file(file.fileName)
            let text = file.content
            if (!text && fetchContent) {
                text = await editor.getTextEditorContentForFile(uri, range)
            }
            return {
                uri,
                range,
                text: text || '',
            }
        })
    )
}

export function viewRangeToRange(range?: ActiveTextEditorSelectionRange): vscode.Range | undefined {
    if (!range) {
        return undefined
    }
    return new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character)
}

async function newChatModelfromTranscriptJSON(editor: Editor, json: TranscriptJSON): Promise<SimpleChatModel> {
    const repos = json.scope?.repositories
    const messages: MessageWithContext[][] = json.interactions.map(
        (interaction: InteractionJSON): MessageWithContext[] => {
            return [
                {
                    message: {
                        speaker: 'human',
                        text: interaction.humanMessage.text,
                    },
                    newContextUsed: deserializedContextFilesToContextItems2(
                        interaction.usedContextFiles,
                        interaction.fullContext,
                        (repos && repos.length > 0 && repos[0]) || undefined
                    ),
                },
                {
                    message: {
                        speaker: 'assistant',
                        text: interaction.assistantMessage.text,
                    },
                },
            ]
        }
    )
    return new SimpleChatModel(json.chatModel || 'anthropic/claude-2', (await Promise.all(messages)).flat(), json.id)
}

export function deserializedContextFilesToContextItems2(
    files: ContextFile[],
    contextMessages: ContextMessage[],
    repo?: string
): ContextItem[] {
    const contextByFile = new Map<string, ContextMessage>()
    for (const contextMessage of contextMessages) {
        if (!contextMessage.file?.fileName) {
            continue
        }
        contextByFile.set(contextMessage.file.fileName, contextMessage)
    }

    return files.map((file: ContextFile): ContextItem => {
        const range = viewRangeToRange(file.range)
        const fallbackURI = vscode.Uri.from({
            scheme: 'file-relative',
            path: file.fileName,
            fragment: range && `L${range.start.line}-${range.end.line}`,
        })
        const uri = file.uri || fallbackURI
        let text = file.content
        if (!text) {
            const contextMessage = contextByFile.get(file.fileName)
            if (contextMessage) {
                text = stripContextWrapper(contextMessage.text || '')
            }
        }
        return {
            uri,
            range,
            text: text || '',
        }
    })
}
