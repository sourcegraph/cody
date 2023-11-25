import { debounce } from 'lodash'
import * as uuid from 'uuid'
import * as vscode from 'vscode'

import { ActiveTextEditorSelectionRange, ChatMessage, ContextFile } from '@sourcegraph/cody-shared'
import { ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { TranscriptJSON } from '@sourcegraph/cody-shared/src/chat/transcript'
import { InteractionJSON } from '@sourcegraph/cody-shared/src/chat/transcript/interaction'
import { Typewriter } from '@sourcegraph/cody-shared/src/chat/typewriter'
import { reformatBotMessage } from '@sourcegraph/cody-shared/src/chat/viewHelpers'
import { ContextMessage } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { Editor } from '@sourcegraph/cody-shared/src/editor'
import { EmbeddingsSearch } from '@sourcegraph/cody-shared/src/embeddings'
import { isError } from '@sourcegraph/cody-shared/src/utils'

import { View } from '../../../webviews/NavBar'
import { getFullConfig } from '../../configuration'
import { getFileContextFile, getOpenTabsContextFile, getSymbolContextFile } from '../../editor/utils/editor-context'
import { VSCodeEditor } from '../../editor/vscode-editor'
import { logDebug } from '../../log'
import { AuthProvider } from '../../services/AuthProvider'
import { telemetryService } from '../../services/telemetry'
import { telemetryRecorder } from '../../services/telemetry-v2'
import { createCodyChatTreeItems } from '../../services/treeViewItems'
import { TreeViewProvider } from '../../services/TreeViewProvider'
import {
    handleCodeFromInsertAtCursor,
    handleCodeFromSaveToNewFile,
    handleCopiedCode,
} from '../../services/utils/codeblock-action-tracker'
import { openExternalLinks, openFilePath, openLocalFileWithRange } from '../../services/utils/workspace-action'
import { MessageErrorType } from '../MessageProvider'
import { ConfigurationSubsetForWebview, getChatModelsForWebview, LocalEnv, WebviewMessage } from '../protocol'
import { countGeneratedCode } from '../utils'

import { contextItemsToContextFiles, embeddingsUrlScheme, relativeFileUrl, stripContextWrapper } from './chat-helpers'
import { ChatHistoryManager } from './ChatHistoryManager'
import { addWebviewViewHTML } from './ChatManager'
import { ChatViewProviderWebview } from './ChatPanelProvider'
import { IChatPanelProvider } from './ChatPanelsManager'
import { DefaultPrompter, IContextProvider, IPrompter } from './prompt'
import { ContextItem, MessageWithContext, SimpleChatModel } from './SimpleChatModel'

interface SimpleChatPanelProviderOptions {
    extensionUri: vscode.Uri
    authProvider: AuthProvider
    chatClient: ChatClient
    embeddingsClient: EmbeddingsSearch | null
    editor: VSCodeEditor
    treeView: TreeViewProvider
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

    private prompter: IPrompter = new DefaultPrompter()

    // HACK: for now, we need awkwardly need to keep this in sync with chatModel.sessionID,
    // as it is necessary to satisfy the IChatPanelProvider interface.
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

    public async executeRecipe(recipeID: RecipeID): Promise<void> {
        await vscode.window.showErrorMessage(`command ${recipeID} not supported`)
    }

    public async executeCustomCommand(title: string): Promise<void> {
        await vscode.window.showErrorMessage(`custom command ${title} not supported`)
    }
    public async clearAndRestartSession(): Promise<void> {
        if (this.chatModel.isEmpty()) {
            return
        }
        await this.saveSession()
        this.chatModel = new SimpleChatModel(this.chatModel.modelID)
        this.sessionID = this.chatModel.sessionID
        await this.updateViewTranscript()
    }

    public clearChatHistory(): Promise<void> {
        // HACK: this is a no-op now. This exists only to satisfy the IChatPanelProvider interface
        // and can be removed once we retire the old ChatPanelProvider
        return Promise.resolve()
    }

    public triggerNotice(notice: { key: string }): void {
        void this.webview?.postMessage({
            type: 'notice',
            notice,
        })
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
        this.cancelInProgressCompletion()
        await this.saveSession()

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
        switch (message.command) {
            case 'ready':
                // The web view is ready to receive events. We need to make sure that it has an up
                // to date config, even if it was already published
                await this.authProvider.announceNewAuthStatus()
                await this.updateViewConfig()
                break
            case 'initialized':
                logDebug('SimpleChatPanelProvider:onDidReceiveMessage', 'initialized')
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
            case 'edit':
                await this.onEdit(message.text)
                telemetryService.log('CodyVSCodeExtension:editChatButton:clicked', undefined, { hasV2Event: true })
                telemetryRecorder.recordEvent('cody.editChatButton', 'clicked')
                break
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
            case 'executeRecipe':
                void this.executeRecipe(message.recipe)
                break
            case 'getUserContext':
                await this.handleContextFiles(message.query)
                break
            case 'custom-prompt':
                await this.executeCustomCommand(message.title)
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
            default:
                this.handleError('Invalid request type from Webview Panel', 'system')
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

    private async onEdit(text: string): Promise<void> {
        this.chatModel.updateLastHumanMessage({ text })
        void this.updateViewTranscript()
        await this.generateAssistantResponse()
    }

    private async onHumanMessageSubmitted(
        text: string,
        submitType: 'user' | 'suggestion' | 'example',
        userContextFiles?: ContextFile[],
        addEnhancedContext = true
    ): Promise<void> {
        this.chatModel.addHumanMessage({ text })
        void this.updateViewTranscript()
        await this.generateAssistantResponse(userContextFiles, addEnhancedContext)
    }

    private async generateAssistantResponse(
        userContextFiles?: ContextFile[],
        addEnhancedContext = true
    ): Promise<void> {
        const contextWindowBytes = 28000 // 7000 tokens * 4 bytes per token

        const userContextItems = await contextFilesToContextItems(this.editor, userContextFiles || [], true)
        const contextProvider = new ContextProvider(
            userContextItems,
            this.editor,
            addEnhancedContext ? this.embeddingsClient : null
        )
        const {
            prompt: promptMessages,
            warnings,
            newContextUsed,
        } = await this.prompter.makePrompt(this.chatModel, contextProvider, contextWindowBytes)

        this.chatModel.setNewContextUsed(newContextUsed)

        if (warnings.length > 0) {
            void this.webview?.postMessage({
                type: 'errors',
                errors: 'Warning: ' + warnings.map(w => (w.trim().endsWith('.') ? w.trim() : w.trim() + '.')).join(' '),
            })
        }

        void this.updateViewTranscript()

        let lastContent = ''
        const typewriter = new Typewriter({
            update: content => {
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

                // Count code generated from response
                const codeCount = countGeneratedCode(lastContent)
                if (codeCount?.charCount) {
                    // const metadata = lastInteraction?.getHumanMessage().metadata
                    telemetryService.log(
                        'CodyVSCodeExtension:chatResponse:hasCode',
                        { ...codeCount, requestID },
                        { hasV2Event: true }
                    )
                    telemetryRecorder.recordEvent('cody.chatResponse.new', 'hasCode', {
                        metadata: {
                            ...codeCount,
                        },
                    })
                }
            },
        })

        this.cancelInProgressCompletion()
        const requestID = uuid.v4()
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

    /**
     * Display error message in webview, either as part of the transcript or as a banner alongside the chat.
     */
    public handleError(errorMsg: string, type: MessageErrorType): void {
        if (type === 'transcript') {
            // TODO(beyang): record error in chat model
            // this.transcript.addErrorAsAssistantResponse(errorMsg)
            void this.webview?.postMessage({ type: 'transcript-errors', isTranscriptError: true })
            return
        }

        void this.webview?.postMessage({ type: 'errors', errors: errorMsg })
    }
}

function toViewMessage(mwc: MessageWithContext): ChatMessage {
    let displayText = mwc.message.text
    if (mwc.message.speaker === 'assistant' && mwc.message.text) {
        displayText = reformatBotMessage(mwc.message.text, '')
    }
    return {
        ...mwc.message,
        displayText,
        contextFiles: contextItemsToContextFiles(mwc.newContextUsed || []),
    }
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
            return []
        }

        console.log('debug: fetching embeddings')
        const contextItems: ContextItem[] = []
        const embeddings = await this.embeddingsClient.search(text, 2, 2)
        if (isError(embeddings)) {
            // TODO(beyang): throw and catch this error
            console.error('# TODO: embeddings error', embeddings)
        } else {
            for (const codeResult of embeddings.codeResults) {
                const uri = vscode.Uri.from({
                    scheme: embeddingsUrlScheme,
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
        const fallbackURI = relativeFileUrl(file.fileName, range)
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
