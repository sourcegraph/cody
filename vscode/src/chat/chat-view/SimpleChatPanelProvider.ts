import * as path from 'path'

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
import { annotateAttribution, Guardrails } from '@sourcegraph/cody-shared/src/guardrails'
import { MAX_BYTES_PER_FILE, NUM_CODE_RESULTS, NUM_TEXT_RESULTS } from '@sourcegraph/cody-shared/src/prompt/constants'
import { truncateTextNearestLine } from '@sourcegraph/cody-shared/src/prompt/truncation'
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
import { ConfigurationSubsetForWebview, getChatModelsForWebview, LocalEnv, WebviewMessage } from '../protocol'
import { countGeneratedCode } from '../utils'

import { embeddingsUrlScheme, relativeFileUrl, stripContextWrapper } from './chat-helpers'
import { ChatHistoryManager } from './ChatHistoryManager'
import { addWebviewViewHTML } from './ChatManager'
import { ChatViewProviderWebview } from './ChatPanelProvider'
import { Config, IChatPanelProvider } from './ChatPanelsManager'
import { DefaultPrompter, IContextProvider, IPrompter } from './prompt'
import { ContextItem, MessageWithContext, SimpleChatModel, toViewMessage } from './SimpleChatModel'

interface SimpleChatPanelProviderOptions {
    config: Config
    extensionUri: vscode.Uri
    authProvider: AuthProvider
    guardrails: Guardrails
    chatClient: ChatClient
    embeddingsClient: EmbeddingsSearch | null
    editor: VSCodeEditor
    treeView: TreeViewProvider
}

export class SimpleChatPanelProvider implements vscode.Disposable, IChatPanelProvider {
    private chatModel: SimpleChatModel = new SimpleChatModel('anthropic/claude-2')

    private config: Config

    public webviewPanel?: vscode.WebviewPanel
    public webview?: ChatViewProviderWebview

    private extensionUri: vscode.Uri
    private disposables: vscode.Disposable[] = []
    private authProvider: AuthProvider
    private guardrails: Guardrails

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
        config,
        extensionUri,
        authProvider,
        guardrails,
        chatClient,
        embeddingsClient,
        editor,
        treeView,
    }: SimpleChatPanelProviderOptions) {
        this.config = config
        this.extensionUri = extensionUri
        this.authProvider = authProvider
        this.chatClient = chatClient
        this.embeddingsClient = embeddingsClient
        this.editor = editor
        this.treeView = treeView
        this.sessionID = this.chatModel.sessionID
        this.guardrails = guardrails
    }

    private completionCanceller?: () => void

    private cancelInProgressCompletion(): void {
        if (this.completionCanceller) {
            this.completionCanceller()
            this.completionCanceller = undefined
        }
    }

    /**
     * Creates the webview panel for the Cody chat interface if it doesn't already exist.
     */
    public async createWebviewPanel(
        activePanelViewColumn?: vscode.ViewColumn,
        lastQuestion?: string
    ): Promise<vscode.WebviewPanel | undefined> {
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
        const viewColumn = activePanelViewColumn || vscode.ViewColumn.Beside

        const panel = vscode.window.createWebviewPanel(
            viewType,
            panelTitle,
            { viewColumn, preserveFocus: true },
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

    /**
     * This is the entrypoint for handling messages from the webview.
     */
    private async onDidReceiveMessage(message: WebviewMessage): Promise<void> {
        switch (message.command) {
            case 'ready':
                // The web view is ready to receive events. We need to make sure that it has an up
                // to date config, even if it was already published
                await this.authProvider.announceNewAuthStatus()
                await this.postViewConfig()
                break
            case 'initialized':
                logDebug('SimpleChatPanelProvider:onDidReceiveMessage', 'initialized')
                this.handleInitialized()
                break
            case 'submit': {
                const requestID = uuid.v4()
                await this.handleHumanMessageSubmitted(
                    requestID,
                    message.text,
                    message.submitType,
                    message.contextFiles,
                    message.addEnhancedContext
                )
                break
            }
            case 'edit': {
                const requestID = uuid.v4()
                await this.handleEdit(requestID, message.text)
                telemetryService.log('CodyVSCodeExtension:editChatButton:clicked', undefined, { hasV2Event: true })
                telemetryRecorder.recordEvent('cody.editChatButton', 'clicked')
                break
            }
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
                this.postError('Invalid request type from Webview Panel')
        }
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

        await this.postViewTranscript()
    }

    public async saveSession(): Promise<void> {
        const allHistory = await this.history.saveChat(this.chatModel.toTranscriptJSON())
        void this.webview?.postMessage({
            type: 'history',
            messages: allHistory,
        })
        await this.treeView.updateTree(createCodyChatTreeItems(allHistory))
    }

    public async clearAndRestartSession(): Promise<void> {
        if (this.chatModel.isEmpty()) {
            return
        }
        await this.saveSession()
        this.chatModel = new SimpleChatModel(this.chatModel.modelID)
        this.sessionID = this.chatModel.sessionID
        await this.postViewTranscript()
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

    private handleInitialized(): void {
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

    private async handleHumanMessageSubmitted(
        requestID: string,
        text: string,
        submitType: 'user' | 'suggestion' | 'example',
        userContextFiles?: ContextFile[],
        addEnhancedContext = true
    ): Promise<void> {
        if (submitType === 'suggestion') {
            const args = { requestID }
            telemetryService.log('CodyVSCodeExtension:chatPredictions:used', args, { hasV2Event: true })
        }

        this.chatModel.addHumanMessage({ text })
        void this.postViewTranscript()
        await this.generateAssistantResponse(requestID, userContextFiles, addEnhancedContext)
    }

    private async handleEdit(requestID: string, text: string): Promise<void> {
        this.chatModel.updateLastHumanMessage({ text })
        void this.postViewTranscript()
        await this.generateAssistantResponse(requestID)
    }

    private async postViewConfig(): Promise<void> {
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

    private async generateAssistantResponse(
        requestID: string,
        userContextFiles?: ContextFile[],
        addEnhancedContext = true
    ): Promise<void> {
        try {
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
                const warningMsg =
                    'Warning: ' + warnings.map(w => (w.trim().endsWith('.') ? w.trim() : w.trim() + '.')).join(' ')
                this.postError(warningMsg)
            }

            void this.postViewTranscript()

            let lastContent = ''
            const typewriter = new Typewriter({
                update: content => {
                    lastContent = content
                    void this.postViewTranscript(
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
                    this.guardrailsAnnotateAttributions(reformatBotMessage(lastContent, ''))
                        .then(displayText => {
                            this.chatModel.addBotMessage({ text: lastContent }, displayText)
                            void this.saveSession()
                            void this.postViewTranscript()

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
                        })
                        .catch(error => {
                            throw error
                        })
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
                    },
                    onError: error => {
                        this.completionCanceller = undefined
                        this.postError(error)
                    },
                },
                { model: this.chatModel.modelID }
            )
        } catch (error) {
            this.postError(`${error}`)
        }
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
                this.postError(`Error retrieving explicit context: ${error}`)
            }
        }, 100)

        await debouncedContextFileQuery(query)
    }

    private async postViewTranscript(messageInProgress?: ChatMessage): Promise<void> {
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
    private postError(errorMsg: string): void {
        void this.webview?.postMessage({ type: 'errors', errors: errorMsg })
    }

    private async guardrailsAnnotateAttributions(text: string): Promise<string> {
        if (!this.config.experimentalGuardrails) {
            return text
        }

        const result = await annotateAttribution(this.guardrails, text)

        // Only log telemetry if we did work (ie had to annotate something).
        if (result.codeBlocks > 0) {
            telemetryService.log(
                'CodyVSCodeExtension:guardrails:annotate',
                {
                    codeBlocks: result.codeBlocks,
                    duration: result.duration,
                },
                { hasV2Event: true }
            )
            telemetryRecorder.recordEvent('cody.guardrails.annotate', 'executed', {
                // Convert nanoseconds to milliseconds to match other telemetry.
                metadata: { codeBlocks: result.codeBlocks, durationMs: result.duration / 1000000 },
            })
        }

        return result.text
    }

    public setConfiguration(newConfig: Config): void {
        this.config = newConfig
    }

    public async executeRecipe(recipeID: RecipeID): Promise<void> {
        await vscode.window.showErrorMessage(`command ${recipeID} not supported`)
    }

    public async executeCustomCommand(title: string): Promise<void> {
        await vscode.window.showErrorMessage(`custom command ${title} not supported`)
    }
}

class ContextProvider implements IContextProvider {
    constructor(
        private userContext: ContextItem[],
        private editor: Editor,
        private embeddingsClient: EmbeddingsSearch | null
    ) {}

    public getUserContext(): ContextItem[] {
        return this.userContext
    }

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
                text: selection.selectedText,
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
            },
        ]
    }
    public async getEnhancedContext(text: string): Promise<ContextItem[]> {
        if (!this.embeddingsClient) {
            return []
        }

        logDebug('SimpleChatPanelProvider', 'getEnhancedContext > embeddings (start)')
        const contextItems: ContextItem[] = []
        const embeddings = await this.embeddingsClient.search(text, NUM_CODE_RESULTS, NUM_TEXT_RESULTS)
        if (isError(embeddings)) {
            throw new Error(`Error retrieving embeddings: ${embeddings}`)
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
        logDebug('SimpleChatPanelProvider', 'getEnhancedContext > embeddings (end)')

        // Include root README if it seems necessary and is not already present
        if (this.shouldIncludeReadmeContext(text)) {
            let containsREADME = false
            for (const contextItem of contextItems) {
                const basename = path.basename(contextItem.uri.fsPath)
                if (basename.toLocaleLowerCase() === 'readme' || basename.toLocaleLowerCase().startsWith('readme.')) {
                    containsREADME = true
                    break
                }
            }
            if (!containsREADME) {
                const readmeContextItems = await this.getReadmeContext()
                return readmeContextItems.concat(contextItems)
            }
        }

        return contextItems
    }

    private shouldIncludeReadmeContext(input: string): boolean {
        input = input.toLowerCase()
        const question = extractQuestion(input)
        if (!question) {
            return false
        }

        // split input into words, discarding spaces and punctuation
        const words = input.split(/\W+/).filter(w => w.length > 0)
        const bagOfWords = Object.fromEntries(words.map(w => [w, true]))

        const projectSignifiers = ['project', 'repository', 'repo', 'library', 'package', 'module', 'codebase']
        const questionIndicators = ['what', 'how', 'describe', 'explain', '?']

        const workspaceUri = this.editor.getWorkspaceRootUri()
        if (workspaceUri) {
            const rootBase = workspaceUri.toString().split('/').at(-1)
            if (rootBase) {
                projectSignifiers.push(rootBase.toLowerCase())
            }
        }

        let containsProjectSignifier = false
        for (const p of projectSignifiers) {
            if (bagOfWords[p]) {
                containsProjectSignifier = true
                break
            }
        }

        let containsQuestionIndicator = false
        for (const q of questionIndicators) {
            if (bagOfWords[q]) {
                containsQuestionIndicator = true
                break
            }
        }

        return containsQuestionIndicator && containsProjectSignifier
    }

    private async getReadmeContext(): Promise<ContextItem[]> {
        let readmeUri
        const patterns = ['README', 'README.*', 'Readme.*', 'readme.*']
        for (const pattern of patterns) {
            const files = await vscode.workspace.findFiles(pattern)
            if (files.length > 0) {
                readmeUri = files[0]
            }
        }
        if (!readmeUri) {
            return []
        }
        const readmeDoc = await vscode.workspace.openTextDocument(readmeUri)
        const readmeText = readmeDoc.getText()
        const { truncated: truncatedReadmeText, range } = truncateTextNearestLine(readmeText, MAX_BYTES_PER_FILE)
        if (truncatedReadmeText.length === 0) {
            return []
        }

        let readmeDisplayUri = readmeUri
        const wsFolder = vscode.workspace.getWorkspaceFolder(readmeUri)
        if (wsFolder) {
            const readmeRelPath = path.relative(wsFolder.uri.fsPath, readmeUri.fsPath)
            if (readmeRelPath) {
                readmeDisplayUri = relativeFileUrl(readmeRelPath)
            }
        }

        return [
            {
                uri: readmeDisplayUri,
                text: truncatedReadmeText,
                range: viewRangeToRange(range),
            },
        ]
    }
}

function contextFilesToContextItems(
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

function viewRangeToRange(range?: ActiveTextEditorSelectionRange): vscode.Range | undefined {
    if (!range) {
        return undefined
    }
    return new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character)
}

async function newChatModelfromTranscriptJSON(editor: Editor, json: TranscriptJSON): Promise<SimpleChatModel> {
    const messages: MessageWithContext[][] = json.interactions.map(
        (interaction: InteractionJSON): MessageWithContext[] => {
            return [
                {
                    message: {
                        speaker: 'human',
                        text: interaction.humanMessage.text,
                    },
                    displayText: interaction.humanMessage.displayText,
                    newContextUsed: deserializedContextFilesToContextItems(
                        interaction.usedContextFiles,
                        interaction.fullContext
                    ),
                },
                {
                    message: {
                        speaker: 'assistant',
                        text: interaction.assistantMessage.text,
                    },
                    displayText: interaction.assistantMessage.displayText,
                },
            ]
        }
    )
    return new SimpleChatModel(json.chatModel || 'anthropic/claude-2', (await Promise.all(messages)).flat(), json.id)
}

export function deserializedContextFilesToContextItems(
    files: ContextFile[],
    contextMessages: ContextMessage[]
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

function extractQuestion(input: string): string | undefined {
    input = input.trim()
    const q = input.indexOf('?')
    if (q !== -1) {
        return input.slice(0, q + 1).trim()
    }
    if (input.length < 100) {
        return input
    }
    return undefined
}
