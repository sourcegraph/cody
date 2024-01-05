import * as uuid from 'uuid'
import * as vscode from 'vscode'

import { ContextFile } from '@sourcegraph/cody-shared'
import { BotResponseMultiplexer } from '@sourcegraph/cody-shared/src/chat/bot-response-multiplexer'
import { ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
import { getPreamble } from '@sourcegraph/cody-shared/src/chat/preamble'
import { CodyPrompt, CustomCommandType } from '@sourcegraph/cody-shared/src/chat/prompts'
import { newInteraction } from '@sourcegraph/cody-shared/src/chat/prompts/utils'
import { Recipe, RecipeID, RecipeType } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { Transcript } from '@sourcegraph/cody-shared/src/chat/transcript'
import { Interaction } from '@sourcegraph/cody-shared/src/chat/transcript/interaction'
import { ChatEventSource, ChatMessage, UserLocalHistory } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { Typewriter } from '@sourcegraph/cody-shared/src/chat/typewriter'
import { reformatBotMessageForChat, reformatBotMessageForEdit } from '@sourcegraph/cody-shared/src/chat/viewHelpers'
import { Guardrails } from '@sourcegraph/cody-shared/src/guardrails'
import { IntentDetector } from '@sourcegraph/cody-shared/src/intent-detector'
import { ANSWER_TOKENS, DEFAULT_MAX_TOKENS } from '@sourcegraph/cody-shared/src/prompt/constants'
import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'
import { isDotCom } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'

import { showAskQuestionQuickPick } from '../commands/utils/menu'
import { VSCodeEditor } from '../editor/vscode-editor'
import { PlatformContext } from '../extension.common'
import { logDebug, logError } from '../log'
import { FixupTask } from '../non-stop/FixupTask'
import { AuthProvider, isNetworkError } from '../services/AuthProvider'
import { localStorage } from '../services/LocalStorageProvider'
import { telemetryService } from '../services/telemetry'
import { telemetryRecorder } from '../services/telemetry-v2'
import { TestSupport } from '../test-support'

import { chatHistory } from './chat-view/ChatHistoryManager'
import { ContextProvider } from './ContextProvider'
import { countGeneratedCode } from './utils'

/**
 * The problem with a token limit for the prompt is that we can only
 * estimate tokens (and do so in a very cheap way), so it can be that
 * we undercount tokens. If we exceed the maximum tokens, things will
 * start to break, so we should have some safety cushion for when we're wrong in estimating.
 *
 * Ie.: Long text, 10000 characters, we estimate it to be 2500 tokens.
 * That would fit into a limit of 3000 tokens easily. Now, it's actually
 * 3500 tokens, because it splits weird and our estimation is off, it will
 * fail. That's where we want to add this safety cushion in.
 */
const SAFETY_PROMPT_TOKENS = 100

/**
 * The types of errors that should be handled from MessageProvider.
 * `transcript`: Errors that can be displayed directly within a chat transcript, if available.
 * `system`: Errors that should be handled differently, e.g. alerted to the user.
 */
export type MessageErrorType = 'transcript' | 'system'

/**
 * A derived class of MessageProvider must implement these handler methods.
 * This contract ensures that MessageProvider is focused solely on building, sending and receiving messages.
 * It does not assume anything about how those messages will be displayed to the user.
 */
abstract class MessageHandler {
    protected abstract handleTranscript(transcript: ChatMessage[], messageInProgress: boolean): void
    protected abstract handleHistory(history: UserLocalHistory): void
    protected abstract handleSuggestions(suggestions: string[]): void
    protected abstract handleCodyCommands(prompts: [string, CodyPrompt][]): void
    protected abstract handleError(error: Error, type: MessageErrorType): void
}

export interface MessageProviderOptions {
    chat: ChatClient
    intentDetector: IntentDetector
    guardrails: Guardrails
    editor: VSCodeEditor
    authProvider: AuthProvider
    contextProvider: ContextProvider
    platform: Pick<PlatformContext, 'recipes'>
}

export abstract class MessageProvider extends MessageHandler implements vscode.Disposable {
    // chat id is used to identify chat session
    public sessionID = new Date(Date.now()).toUTCString()
    public currentRequestID: string | undefined = undefined

    private isMessageInProgress = false
    private cancelCompletionCallback: (() => void) | null = null

    // Allows recipes to hook up subscribers to process sub-streams of bot output
    private multiplexer: BotResponseMultiplexer = new BotResponseMultiplexer()

    protected transcript: Transcript = new Transcript()
    protected disposables: vscode.Disposable[] = []

    protected chat: ChatClient
    protected intentDetector: IntentDetector
    protected guardrails: Guardrails
    protected readonly editor: VSCodeEditor
    protected authProvider: AuthProvider
    protected readonly contextProvider: ContextProvider
    protected platform: Pick<PlatformContext, 'recipes'>

    protected chatModel: string | undefined = undefined
    protected chatTitle: string | undefined = 'Untitled'

    constructor(options: MessageProviderOptions) {
        super()

        if (TestSupport.instance) {
            TestSupport.instance.messageProvider.set(this)
        }

        this.chat = options.chat
        this.intentDetector = options.intentDetector
        this.guardrails = options.guardrails
        this.editor = options.editor
        this.authProvider = options.authProvider
        this.contextProvider = options.contextProvider
        this.platform = options.platform

        // Listen to configuration changes to possibly enable Custom Commands
        this.contextProvider.configurationChangeEvent.event(() => this.sendCodyCommands())
    }

    protected async init(chatID?: string): Promise<void> {
        if (chatID) {
            await this.restoreSession(chatID)
        }
        this.sendTranscript()
        this.sendHistory()
        await this.contextProvider.init()
        await this.sendCodyCommands()
    }

    private get isDotComUser(): boolean {
        const endpoint = this.authProvider.getAuthStatus()?.endpoint || ''
        return isDotCom(endpoint)
    }

    public async clearAndRestartSession(): Promise<void> {
        await this.saveTranscriptToChatHistory()
        this.cancelCompletion()
        this.createNewChatID()
        this.isMessageInProgress = false
        this.transcript.reset()
        this.handleSuggestions([])
        this.sendTranscript()
        this.sendHistory()
        telemetryService.log('CodyVSCodeExtension:chatReset:executed', undefined, { hasV2Event: true })
        telemetryRecorder.recordEvent('cody.messageProvider.chatReset', 'executed')
    }

    public async clearHistory(): Promise<void> {
        await chatHistory.clear(this.authProvider.getAuthStatus())
        // Reset the current transcript
        this.transcript = new Transcript()
        await this.clearAndRestartSession()
        this.sendHistory()
        telemetryService.log('CodyVSCodeExtension:clearChatHistoryButton:clicked', undefined, { hasV2Event: true })
        telemetryRecorder.recordEvent('cody.messageProvider.clearChatHistoryButton', 'clicked')
    }

    /**
     * Restores a session from a chatID
     */
    public async restoreSession(chatID: string): Promise<void> {
        const history = chatHistory.getChat(this.authProvider.getAuthStatus(), chatID)
        if (!history || chatID === this.sessionID) {
            return
        }
        await this.saveTranscriptToChatHistory()
        this.cancelCompletion()
        this.createNewChatID(chatID)
        this.transcript = Transcript.fromJSON(history)
        this.chatModel = this.transcript.chatModel
        this.chatTitle = chatHistory.getChat(this.authProvider.getAuthStatus(), chatID)?.chatTitle
        await this.transcript.toJSON()
        this.sendTranscript()
        this.sendHistory()
        telemetryService.log('CodyVSCodeExtension:restoreChatHistoryButton:clicked', undefined, { hasV2Event: true })
        telemetryRecorder.recordEvent('cody.messageProvider.restoreChatHistoryButton', 'clicked')
    }

    private createNewChatID(chatID?: string): void {
        this.sessionID = chatID || new Date(Date.now()).toUTCString()
    }

    private sendPrompt(
        promptMessages: Message[],
        responsePrefix = '',
        multiplexerTopic = BotResponseMultiplexer.DEFAULT_TOPIC,
        recipe: {
            id: RecipeID
            type: RecipeType
            stopSequences?: string[]
        },
        requestID: string
    ): void {
        this.cancelCompletion()
        void vscode.commands.executeCommand('setContext', 'cody.reply.pending', true)

        const typewriter = new Typewriter({
            update: content => {
                const displayText =
                    recipe.type === RecipeType.Edit
                        ? reformatBotMessageForEdit(content, responsePrefix)
                        : reformatBotMessageForChat(content, responsePrefix)
                this.transcript.addAssistantResponse(content, displayText)
                this.sendTranscript()
            },
            close: () => {},
        })

        let text = ''

        this.multiplexer.sub(multiplexerTopic, {
            onResponse: (content: string) => {
                text += content
                typewriter.update(text)
                return Promise.resolve()
            },
            onTurnComplete: async () => {
                typewriter.close()
                typewriter.stop()

                const lastInteraction = this.transcript.getLastInteraction()
                if (lastInteraction) {
                    const displayText =
                        recipe.type === RecipeType.Edit
                            ? reformatBotMessageForEdit(text, responsePrefix)
                            : reformatBotMessageForChat(text, responsePrefix)
                    this.transcript.addAssistantResponse(text, displayText)
                }
                await this.onCompletionEnd()
                // Count code generated from response
                const codeCount = countGeneratedCode(text)
                const metadata = lastInteraction?.getHumanMessage().metadata
                const responseText = this.isDotComUser ? text : undefined
                telemetryService.log(
                    'CodyVSCodeExtension:chatResponse:hasCode',
                    { ...codeCount, ...metadata, requestID, responseText },
                    { hasV2Event: true }
                )

                if (codeCount?.charCount) {
                    telemetryRecorder.recordEvent(
                        `cody.messageProvider.chatResponse.${metadata?.source || recipe.id}`,
                        'hasCode',
                        {
                            metadata: {
                                ...codeCount,
                            },
                        }
                    )
                }
                this.currentRequestID = undefined
            },
        })

        let textConsumed = 0

        this.cancelCompletionCallback = this.chat.chat(
            promptMessages,
            {
                onChange: text => {
                    if (textConsumed === 0 && responsePrefix) {
                        void this.multiplexer.publish(responsePrefix)
                    }

                    // TODO(dpc): The multiplexer can handle incremental text. Change chat to provide incremental text.
                    text = text.slice(textConsumed)
                    textConsumed += text.length
                    void this.multiplexer.publish(text)
                },
                onComplete: () => {
                    void this.multiplexer.notifyTurnComplete()
                },
                onError: (err, statusCode) => {
                    // TODO notify the multiplexer of the error
                    logError('ChatViewProvider:onError', err.message)

                    if (isAbortError(err)) {
                        this.isMessageInProgress = false
                        this.sendTranscript()
                        return
                    }

                    // Log users out on unauth error
                    if (statusCode && statusCode >= 400 && statusCode <= 410) {
                        this.authProvider
                            .auth(
                                this.contextProvider.config.serverEndpoint,
                                this.contextProvider.config.accessToken,
                                this.contextProvider.config.customHeaders
                            )
                            .catch(error => console.error(error))
                        logError('ChatViewProvider:onError:unauthUser', err.message, { verbose: { statusCode } })
                    }

                    if (isNetworkError(err)) {
                        err = new Error('Cody could not respond due to network error.')
                    }

                    // Display error message as assistant response
                    this.handleError(err, 'transcript')
                    // We ignore embeddings errors in this instance because we're already showing an
                    // error message and don't want to overwhelm the user.
                    void this.onCompletionEnd(true)
                    console.error(`Completion request failed: ${err.message}`)
                },
            },
            { model: this.chatModel, stopSequences: recipe.stopSequences }
        )
    }

    protected cancelCompletion(): void {
        this.currentRequestID = undefined
        this.cancelCompletionCallback?.()
        this.cancelCompletionCallback = null
    }

    protected async onCompletionEnd(ignoreEmbeddingsError: boolean = false): Promise<void> {
        this.currentRequestID = undefined
        this.isMessageInProgress = false
        this.cancelCompletionCallback = null
        this.sendTranscript()
        await this.saveTranscriptToChatHistory()
        this.sendHistory()
        void vscode.commands.executeCommand('setContext', 'cody.reply.pending', false)
        if (!ignoreEmbeddingsError) {
            this.logEmbeddingsSearchErrors()
        }
    }

    protected async abortCompletion(): Promise<void> {
        this.currentRequestID = undefined
        await this.saveTranscriptToChatHistory()
        this.cancelCompletion()
        await this.multiplexer.notifyTurnComplete()
        await this.onCompletionEnd()
    }

    private getRecipe(id: RecipeID): Recipe | undefined {
        return this.platform.recipes.find(recipe => recipe.id === id)
    }

    public async executeRecipe(
        recipeId: RecipeID,
        humanChatInput = '',
        source?: ChatEventSource,
        userInputContextFiles?: ContextFile[],
        addEnhancedContext = true
    ): Promise<void> {
        if (this.isMessageInProgress) {
            this.handleError(
                new Error('Cannot execute multiple actions. Please wait for the current action to finish.'),
                'system'
            )
            return
        }

        const requestID = uuid.v4()
        this.currentRequestID = requestID

        if (source === 'chat' && this.contextProvider.config.experimentalChatPredictions) {
            void this.runRecipeForSuggestion('next-questions', humanChatInput, source)
        }

        // Filter the human input to check for chat commands and retrieve the correct recipe id
        // e.g. /edit from 'chat-question' should be redirected to use the 'fixup' recipe
        const command = await this.chatCommandsFilter(
            humanChatInput,
            recipeId,
            { source, requestID },
            userInputContextFiles
        )
        if (!command) {
            return
        }
        humanChatInput = command?.text
        recipeId = command?.recipeId

        const recipe = this.getRecipe(recipeId)
        if (!recipe) {
            logDebug('MessageProvider:executeRecipe', 'no recipe found')
            return
        }

        logDebug('MessageProvider:executeRecipe', recipeId, { verbose: humanChatInput })

        // Create a new multiplexer to drop any old subscribers
        this.multiplexer = new BotResponseMultiplexer()

        let interaction: Interaction | null = null

        try {
            interaction = await recipe.getInteraction(humanChatInput, {
                editor: this.editor,
                intentDetector: this.intentDetector,
                codebaseContext: this.contextProvider.context,
                responseMultiplexer: this.multiplexer,
                addEnhancedContext,
                userInputContextFiles,
            })
        } catch (error) {
            this.handleError(new Error('Fail to submit question'), 'system')
            console.error(error)
            return
        }

        if (!interaction) {
            return
        }

        const error = interaction?.getAssistantMessage()?.error
        if (error) {
            const errorMsg = typeof error === 'string' ? error : error.message
            await this.addCustomInteraction({ assistantResponse: errorMsg }, interaction)
            return
        }

        this.isMessageInProgress = true
        interaction.setMetadata({ requestID, source })
        this.transcript.addInteraction(interaction)

        const contextSummary = {
            embeddings: 0,
            local: 0,
            user: 0, // context added by user with @ command
        }
        // Check whether or not to connect to LLM backend for responses
        // Ex: performing fuzzy / context-search does not require responses from LLM backend
        switch (recipeId) {
            case 'local-indexed-keyword-search':
            case 'context-search':
                this.sendTranscript()
                await this.onCompletionEnd()
                break
            default: {
                this.sendTranscript()

                const { prompt, contextFiles, preciseContexts } = await this.transcript.getPromptForLastInteraction(
                    getPreamble(this.contextProvider.context.getCodebase()),
                    this.maxPromptTokens
                )
                this.transcript.setUsedContextFilesForLastInteraction(contextFiles, preciseContexts)
                this.sendPrompt(
                    prompt,
                    interaction.getAssistantMessage().prefix ?? '',
                    recipe.multiplexerTopic,
                    { id: recipeId, type: recipe.type ?? RecipeType.Ask, stopSequences: recipe.stopSequences },
                    requestID
                )
                this.sendTranscript()
                await this.saveTranscriptToChatHistory()

                contextFiles.map(file => {
                    if (file.source === 'embeddings') {
                        contextSummary.embeddings++
                    } else if (file.source === 'user') {
                        contextSummary.user++
                    } else {
                        contextSummary.local++
                    }
                })
            }
        }

        const promptText = this.isDotComUser ? interaction.getHumanMessage().text : undefined
        const properties = { contextSummary, source, requestID, chatModel: this.chatModel, promptText }
        telemetryService.log(`CodyVSCodeExtension:${recipe.id}:recipe-used`, properties, { hasV2Event: true })
        telemetryRecorder.recordEvent(`cody.recipe.${recipe.id}`, 'recipe-used', { metadata: { ...contextSummary } })
    }

    protected async runRecipeForSuggestion(
        recipeId: RecipeID,
        humanChatInput: string = '',
        source?: ChatEventSource
    ): Promise<void> {
        const recipe = this.getRecipe(recipeId)
        if (!recipe) {
            return
        }

        const multiplexer = new BotResponseMultiplexer()
        const transcript = Transcript.fromJSON(await this.transcript.toJSON())

        const interaction = await recipe.getInteraction(humanChatInput, {
            editor: this.editor,
            intentDetector: this.intentDetector,
            codebaseContext: this.contextProvider.context,
            responseMultiplexer: multiplexer,
            // TODO(dpc): Support initial chats *without* enhanced context
            addEnhancedContext: this.transcript.isEmpty,
        })
        if (!interaction) {
            return
        }
        transcript.addInteraction(interaction)

        const { prompt, contextFiles } = await transcript.getPromptForLastInteraction(
            getPreamble(this.contextProvider.context.getCodebase()),
            this.maxPromptTokens
        )
        transcript.setUsedContextFilesForLastInteraction(contextFiles)

        const args = { requestID: this.currentRequestID, source }
        telemetryService.log(`CodyVSCodeExtension:${recipe.id}:recipe-used`, args, { hasV2Event: true })

        let text = ''
        multiplexer.sub(BotResponseMultiplexer.DEFAULT_TOPIC, {
            onResponse: (content: string) => {
                text += content
                return Promise.resolve()
            },
            onTurnComplete: () => {
                const suggestions = text
                    .split('\n')
                    .slice(0, 3)
                    .map(line => line.trim().replace(/^-/, '').trim())
                this.handleSuggestions(suggestions)
                return Promise.resolve()
            },
        })

        let textConsumed = 0
        this.chat.chat(prompt, {
            onChange: text => {
                // TODO(dpc): The multiplexer can handle incremental text. Change chat to provide incremental text.
                text = text.slice(textConsumed)
                textConsumed += text.length
                void multiplexer.publish(text)
            },
            onComplete: () => {
                void multiplexer.notifyTurnComplete()
            },
            onError: (error, statusCode) => {
                console.error(error, statusCode)
            },
        })
    }

    /**
     * Send transcript to view
     */
    private sendTranscript(): void {
        const chatTranscript = this.transcript.toChat()
        this.handleTranscript(chatTranscript, this.isMessageInProgress)
    }

    public isCustomCommandAction(title: string): boolean {
        const customPromptActions = ['add', 'get', 'menu']
        return customPromptActions.includes(title)
    }

    /**
     * Handle instructions returned from webview in regard to a Cody Command
     * Finds and execute a Cody command
     */
    public async executeCustomCommand(title: string, type?: CustomCommandType): Promise<void> {
        title = title.trim()
        switch (title) {
            case 'get':
                await this.sendCodyCommands()
                break
            case 'menu':
                await this.editor.controllers.command?.menu('custom')
                await this.sendCodyCommands()
                break
            case 'add':
                if (!type) {
                    break
                }
                await this.editor.controllers.command?.configFileAction('add', type)
                telemetryService.log('CodyVSCodeExtension:addCommandButton:clicked', undefined, { hasV2Event: true })
                telemetryRecorder.recordEvent('cody.addCommandButton', 'clicked')
                break
        }
        // Get prompt details from controller by title then execute prompt's command
        return this.executeRecipe('custom-prompt', title, 'custom-commands')
    }

    protected async chatCommandsFilter(
        text: string,
        recipeId: RecipeID,
        eventTrace?: { requestID?: string; source?: ChatEventSource },
        userContextFiles?: ContextFile[]
    ): Promise<{ text: string; recipeId: RecipeID; source?: ChatEventSource } | void> {
        const source = eventTrace?.source || undefined
        text = text.trim()
        if (!text?.startsWith('/')) {
            return { text, recipeId, source }
        }

        switch (true) {
            case text === '/':
                return vscode.commands.executeCommand('cody.action.commands.menu', source)

            case text === '/commands-settings':
                telemetryService.log('CodyVSCodeExtension:commandConfigMenuButton:clicked', eventTrace, {
                    hasV2Event: true,
                })
                telemetryRecorder.recordEvent(`cody.sidebar.commandConfigMenuButton.${source}`, 'clicked')
                return vscode.commands.executeCommand('cody.settings.commands')

            case /^\/o(pen)?\s/.test(text) && this.editor.controllers.command !== undefined:
                telemetryService.log('CodyVSCodeExtension:command:openFile:executed', eventTrace, { hasV2Event: true })
                telemetryRecorder.recordEvent('cody.command.openFile', 'executed')
                // open the user's ~/.vscode/cody.json file
                return this.editor.controllers.command?.open(text.split(' ')[1])

            case /^\/r(eset)?$/.test(text):
                telemetryService.log('CodyVSCodeExtension:command:resetChat:executed', eventTrace, { hasV2Event: true })
                telemetryRecorder.recordEvent('cody.command.resetChat', 'executed')
                return this.clearAndRestartSession()

            case /^\/symf(?:\s|$)/.test(text):
                telemetryService.log('CodyVSCodeExtension:command:symf:executed', eventTrace, { hasV2Event: true })
                return { text, recipeId: 'local-indexed-keyword-search' }

            case /^\/s(earch)?\s/.test(text):
                return { text, recipeId: 'context-search' }

            case /^\/edit(\s)?/.test(text):
                return vscode.commands.executeCommand('cody.command.edit-code', { instruction: text }, source)

            // TODO bee retire chat-question recipe and run all chat questions in custom-prompt recipe
            case /^\/ask(\s)?/.test(text): {
                const question = text.replace('/ask', '').trimStart() || (await showAskQuestionQuickPick())
                return { text: question, recipeId: 'chat-question', source }
            }

            default: {
                if (!this.editor.getActiveTextEditor()?.filePath) {
                    const assistantResponse = 'Command failed. Please open a file and try again.'
                    return this.addCustomInteraction({ assistantResponse, text, source })
                }
                const commandRunnerID = await this.editor.controllers.command?.addCommand(
                    text,
                    eventTrace?.requestID,
                    userContextFiles
                )
                // no op
                if (!commandRunnerID) {
                    return
                }

                if (commandRunnerID === 'invalid') {
                    const assistantResponse = `__${text}__ is not a valid command`
                    // If no command found, send error message to view
                    return this.addCustomInteraction({ assistantResponse, text, source })
                }

                return { text: commandRunnerID, recipeId: 'custom-prompt', source }
            }
        }
    }

    /**
     * Adds a custom interaction to the transcript.
     *
     * This method adds a new Interaction with the given assistant response and human input to the transcript.
     * It then sends the updated transcript, checks for transcript errors, and saves the transcript to the chat history
     */
    private async addCustomInteraction(
        args: {
            assistantResponse: string
            text?: string
            humanInput?: string
            source?: ChatEventSource
        },
        interaction?: Interaction
    ): Promise<void> {
        const customInteraction = await newInteraction(args)
        const updatedInteraction = interaction || customInteraction
        updatedInteraction.setMetadata({ requestID: this.currentRequestID, source: args.source })
        this.transcript.addInteraction(updatedInteraction)
        this.sendTranscript()
        await this.saveTranscriptToChatHistory()
    }

    /**
     * Send list of Cody commands (default and custom) to webview
     */
    private async sendCodyCommands(): Promise<void> {
        const send = async (): Promise<void> => {
            await this.editor.controllers.command?.refresh()
            const commands = (await this.editor.controllers.command?.getAllCommands(true)) || []
            void this.handleCodyCommands(commands)
        }
        this.editor.controllers.command?.setMessenger(send)
        await send()
    }

    private async saveTranscriptToChatHistory(): Promise<void> {
        if (this.transcript.isEmpty) {
            return
        }
        await this.saveChatHistory()
        this.sendHistory()
    }

    /**
     * Save chat history
     */
    private async saveChatHistory(): Promise<void> {
        const json = await this.transcript.toJSON()
        await chatHistory.saveChat(this.authProvider.getAuthStatus(), json)
    }

    /**
     * Delete history from current chat history and local storage
     */
    protected async deleteHistory(chatID: string): Promise<void> {
        await chatHistory.deleteChat(this.authProvider.getAuthStatus(), chatID)
        this.sendHistory()
        telemetryService.log('CodyVSCodeExtension:deleteChatHistoryButton:clicked', undefined, { hasV2Event: true })
        telemetryRecorder.recordEvent('cody.deleteChatHistoryButton', 'clicked')
    }

    /**
     * Export chat history to file system
     */
    public async exportHistory(): Promise<void> {
        telemetryService.log('CodyVSCodeExtension:exportChatHistoryButton:clicked', undefined, { hasV2Event: true })
        telemetryRecorder.recordEvent('cody.exportChatHistoryButton', 'clicked')
        const historyJson = localStorage.getChatHistory(this.authProvider.getAuthStatus())?.chat
        const exportPath = await vscode.window.showSaveDialog({ filters: { 'Chat History': ['json'] } })
        if (!exportPath || !historyJson) {
            return
        }
        try {
            const logContent = new TextEncoder().encode(JSON.stringify(historyJson))
            await vscode.workspace.fs.writeFile(exportPath, logContent)
            // Display message and ask if user wants to open file
            void vscode.window.showInformationMessage('Chat history exported successfully.', 'Open').then(choice => {
                if (choice === 'Open') {
                    void vscode.commands.executeCommand('vscode.open', exportPath)
                }
            })
        } catch (error) {
            logError('MessageProvider:exportHistory', 'Failed to export chat history', error)
        }
    }

    /**
     * Send history to view
     */
    private sendHistory(): void {
        const userHistory = chatHistory.getLocalHistory(this.authProvider.getAuthStatus())
        if (userHistory) {
            this.handleHistory(userHistory)
        }
    }

    /**
     * Send embedding connections or results error to output
     */
    private logEmbeddingsSearchErrors(): void {
        if (this.contextProvider.config.useContext !== 'embeddings') {
            return
        }
        const searchErrors = this.contextProvider.context.getEmbeddingSearchErrors()
        // Display error message as assistant response for users with indexed codebase but getting search errors
        if (this.contextProvider.context.checkEmbeddingsConnection() && searchErrors) {
            this.handleError(new Error(searchErrors), 'transcript')
            logError('ChatViewProvider:onLogEmbeddingsErrors', '', { verbose: searchErrors })
        }
    }

    public transcriptForTesting(testing: TestSupport): ChatMessage[] {
        if (!testing) {
            console.error('used ForTesting method without test support object')
            return []
        }
        return this.transcript.toChat()
    }

    public fixupTasksForTesting(testing: TestSupport): FixupTask[] {
        if (!testing) {
            console.error('used ForTesting method without test support object')
            return []
        }
        if (!this.editor.controllers.fixups) {
            throw new Error('no fixup controller')
        }
        return this.editor.controllers.fixups.getTasks()
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }

    private get maxPromptTokens(): number {
        const authStatus = this.authProvider.getAuthStatus()

        const codyConfig = vscode.workspace.getConfiguration('cody')
        const tokenLimit = codyConfig.get<number>('provider.limit.prompt')
        const localSolutionLimit = codyConfig.get<number>('provider.limit.solution')

        // The local config takes precedence over the server config.
        if (tokenLimit && localSolutionLimit) {
            return tokenLimit - localSolutionLimit
        }

        const solutionLimit = (localSolutionLimit || ANSWER_TOKENS) + SAFETY_PROMPT_TOKENS

        if (authStatus.configOverwrites?.chatModelMaxTokens) {
            return authStatus.configOverwrites.chatModelMaxTokens - solutionLimit
        }

        return DEFAULT_MAX_TOKENS - solutionLimit
    }
}

function isAbortError(error: Error): boolean {
    return error.message === 'aborted' || error.message === 'socket hang up'
}
