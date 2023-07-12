import * as vscode from 'vscode'

import { BotResponseMultiplexer } from '@sourcegraph/cody-shared/src/chat/bot-response-multiplexer'
import { ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
import { getPreamble } from '@sourcegraph/cody-shared/src/chat/preamble'
import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { Transcript } from '@sourcegraph/cody-shared/src/chat/transcript'
import { ChatHistory, ChatMessage, UserLocalHistory } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { reformatBotMessage } from '@sourcegraph/cody-shared/src/chat/viewHelpers'
import { CodebaseContext } from '@sourcegraph/cody-shared/src/codebase-context'
import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { annotateAttribution, Guardrails } from '@sourcegraph/cody-shared/src/guardrails'
import { highlightTokens } from '@sourcegraph/cody-shared/src/hallucinations-detector'
import { IntentDetector } from '@sourcegraph/cody-shared/src/intent-detector'
import { ANSWER_TOKENS, DEFAULT_MAX_TOKENS } from '@sourcegraph/cody-shared/src/prompt/constants'
import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'

import { VSCodeEditor } from '../../editor/vscode-editor'
import { logEvent } from '../../event-logger'
import { debug } from '../../log'
import { FixupTask } from '../../non-stop/FixupTask'
import { IdleRecipeRunner } from '../../non-stop/roles'
import { AuthProvider } from '../../services/AuthProvider'
import { LocalStorage } from '../../services/LocalStorageProvider'
import { TestSupport } from '../../test-support'
import { fastFilesExist } from '../fastFileFinder'
import { defaultAuthStatus } from '../protocol'
import { getRecipe } from '../recipes'

import { ContextProvider } from './ContextProvider'

export type Config = Pick<
    ConfigurationWithAccessToken,
    | 'codebase'
    | 'serverEndpoint'
    | 'debugEnable'
    | 'debugFilter'
    | 'debugVerbose'
    | 'customHeaders'
    | 'accessToken'
    | 'useContext'
    | 'experimentalChatPredictions'
    | 'experimentalGuardrails'
>

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

abstract class MessageHandler {
    protected abstract handleTranscript(transcript: ChatMessage[], messageInProgress: boolean): void
    protected abstract handleHistory(history: UserLocalHistory): void
    protected abstract handleError(errorMsg: string): void
    protected abstract handleSuggestions(suggestions: string[]): void
}

export interface MessageProviderOptions {
    config: Omit<Config, 'codebase'>
    chat: ChatClient
    intentDetector: IntentDetector
    codebaseContext: CodebaseContext
    guardrails: Guardrails
    editor: VSCodeEditor
    localStorage: LocalStorage
    rgPath: string
    authProvider: AuthProvider
    contextProvider: ContextProvider
}

export abstract class MessageProvider extends MessageHandler implements vscode.Disposable, IdleRecipeRunner {
    private isMessageInProgress = false
    private cancelCompletionCallback: (() => void) | null = null

    private currentChatID = ''
    protected static inputHistory: string[] = []
    protected static chatHistory: ChatHistory = {}

    protected transcript: Transcript = new Transcript()

    // Allows recipes to hook up subscribers to process sub-streams of bot output
    protected multiplexer: BotResponseMultiplexer = new BotResponseMultiplexer()

    protected disposables: vscode.Disposable[] = []

    // Provided configuration to the MessageProvider
    protected config: Omit<Config, 'codebase'>
    protected chat: ChatClient
    protected intentDetector: IntentDetector
    protected codebaseContext: CodebaseContext
    protected guardrails: Guardrails
    protected editor: VSCodeEditor
    protected localStorage: LocalStorage
    protected rgPath: string
    protected authProvider: AuthProvider
    protected contextProvider: ContextProvider

    constructor(options: MessageProviderOptions) {
        super()

        this.config = options.config
        this.chat = options.chat
        this.intentDetector = options.intentDetector
        this.codebaseContext = options.codebaseContext
        this.guardrails = options.guardrails
        this.editor = options.editor
        this.localStorage = options.localStorage
        this.rgPath = options.rgPath
        this.authProvider = options.authProvider
        this.contextProvider = options.contextProvider

        // chat id is used to identify chat session
        this.createNewChatID()
    }

    protected async init(): Promise<void> {
        this.loadChatHistory()
        this.sendTranscript()
        this.sendHistory()
        await this.loadRecentChat()
        await this.contextProvider.init()
    }

    private idleCallbacks_: (() => void)[] = []

    private get isIdle(): boolean {
        // TODO: Use a cooldown timer for typing and interaction
        return !this.isMessageInProgress
    }

    private scheduleIdleRecipes(): void {
        setTimeout(() => {
            if (!this.isIdle) {
                // We rely on the recipe ending re-scheduling idle recipes
                return
            }
            const notifyIdle = this.idleCallbacks_.shift()
            if (!notifyIdle) {
                return
            }
            try {
                notifyIdle()
            } catch (error) {
                console.error(error)
            }
            if (this.idleCallbacks_.length) {
                this.scheduleIdleRecipes()
            }
        }, 1000)
    }

    public onIdle(callback: () => void): void {
        if (this.isIdle) {
            // Run "now", but not synchronously on this callstack.
            void Promise.resolve().then(callback)
        } else {
            this.idleCallbacks_.push(callback)
        }
    }

    public runIdleRecipe(recipeId: RecipeID, humanChatInput?: string): Promise<void> {
        if (!this.isIdle) {
            throw new Error('not idle')
        }
        return this.executeRecipe(recipeId, humanChatInput)
    }

    public async clearAndRestartSession(): Promise<void> {
        await this.saveTranscriptToChatHistory()
        await this.setAnonymousUserID()
        this.createNewChatID()
        this.cancelCompletion()
        this.isMessageInProgress = false
        this.transcript.reset()
        this.handleSuggestions([])
        this.sendTranscript()
        this.sendHistory()
    }

    public async clearHistory(): Promise<void> {
        MessageProvider.chatHistory = {}
        MessageProvider.inputHistory = []
        await this.localStorage.removeChatHistory()
    }

    public async setAnonymousUserID(): Promise<void> {
        await this.localStorage.setAnonymousUserID()
    }

    /**
     * Restores a session from a chatID
     */
    public async restoreSession(chatID: string): Promise<void> {
        await this.saveTranscriptToChatHistory()
        this.cancelCompletion()
        this.currentChatID = chatID
        this.transcript = Transcript.fromJSON(MessageProvider.chatHistory[chatID])
        await this.transcript.toJSON()
        this.sendTranscript()
        this.sendHistory()
    }

    private createNewChatID(): void {
        this.currentChatID = new Date(Date.now()).toUTCString()
    }

    private sendPrompt(promptMessages: Message[], responsePrefix = ''): void {
        this.cancelCompletion()
        void vscode.commands.executeCommand('setContext', 'cody.reply.pending', true)

        let text = ''

        this.multiplexer.sub(BotResponseMultiplexer.DEFAULT_TOPIC, {
            onResponse: (content: string) => {
                text += content
                const displayText = reformatBotMessage(text, responsePrefix)
                this.transcript.addAssistantResponse(displayText)
                this.sendTranscript()
                return Promise.resolve()
            },
            onTurnComplete: async () => {
                const lastInteraction = this.transcript.getLastInteraction()
                if (lastInteraction) {
                    const displayText = reformatBotMessage(text, responsePrefix)
                    const fileExistFunc = (filePaths: string[]): Promise<{ [filePath: string]: boolean }> => {
                        const rootPath = this.editor.getWorkspaceRootPath()
                        if (!rootPath) {
                            return Promise.resolve({})
                        }
                        return fastFilesExist(this.rgPath, rootPath, filePaths)
                    }
                    let { text: highlightedDisplayText } = await highlightTokens(
                        displayText || '',
                        fileExistFunc,
                        this.contextProvider.currentWorkspaceRoot
                    )
                    // TODO(keegancsmith) guardrails may be slow, we need to make this async update the interaction.
                    highlightedDisplayText = await this.guardrailsAnnotateAttributions(highlightedDisplayText)
                    this.transcript.addAssistantResponse(text || '', highlightedDisplayText)
                }
                await this.onCompletionEnd()
            },
        })

        let textConsumed = 0

        this.cancelCompletionCallback = this.chat.chat(promptMessages, {
            onChange: text => {
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
                debug('ChatViewProvider:onError', err)

                if (isAbortError(err)) {
                    return
                }
                // Display error message as assistant response
                this.transcript.addErrorAsAssistantResponse(err)
                // Log users out on unauth error
                if (statusCode && statusCode >= 400 && statusCode <= 410) {
                    const authStatus = { ...defaultAuthStatus }
                    if (statusCode === 403) {
                        authStatus.authenticated = true
                        authStatus.requiresVerifiedEmail = true
                    } else {
                        authStatus.showInvalidAccessTokenError = true
                    }
                    debug('ChatViewProvider:onError:unauth', err, { verbose: { authStatus } })
                    void this.clearAndRestartSession()
                    void this.authProvider.auth(
                        this.config.serverEndpoint,
                        this.config.accessToken,
                        this.config.customHeaders
                    )
                }
                // We ignore embeddings errors in this instance because we're already showing an
                // error message and don't want to overwhelm the user.
                // TODO: Make this async?
                void this.onCompletionEnd(true)
                // TODO: Move this
                void this.editor.controllers.inline.error()
                console.error(`Completion request failed: ${err}`)
            },
        })
    }

    protected cancelCompletion(): void {
        this.cancelCompletionCallback?.()
        this.cancelCompletionCallback = null
    }

    protected async onCompletionEnd(ignoreEmbeddingsError: boolean = false): Promise<void> {
        this.isMessageInProgress = false
        this.cancelCompletionCallback = null
        this.sendTranscript()
        await this.saveTranscriptToChatHistory()
        this.sendHistory()
        void vscode.commands.executeCommand('setContext', 'cody.reply.pending', false)
        // TODO: move this
        this.editor.controllers.inline.setResponsePending(false)
        if (!ignoreEmbeddingsError) {
            this.logEmbeddingsSearchErrors()
        }
        this.scheduleIdleRecipes()
    }

    public async executeRecipe(recipeId: RecipeID, humanChatInput: string = ''): Promise<void> {
        debug('ChatViewProvider:executeRecipe', recipeId, { verbose: humanChatInput })
        if (this.isMessageInProgress) {
            this.handleError('Cannot execute multiple recipes. Please wait for the current recipe to finish.')
            return
        }

        const recipe = getRecipe(recipeId)
        if (!recipe) {
            return
        }

        // Create a new multiplexer to drop any old subscribers
        this.multiplexer = new BotResponseMultiplexer()

        const interaction = await recipe.getInteraction(humanChatInput, {
            editor: this.editor,
            intentDetector: this.intentDetector,
            codebaseContext: this.codebaseContext,
            responseMultiplexer: this.multiplexer,
            firstInteraction: this.transcript.isEmpty,
        })
        if (!interaction) {
            return
        }
        this.isMessageInProgress = true
        this.transcript.addInteraction(interaction)

        // Check whether or not to connect to LLM backend for responses
        // Ex: performing fuzzy / context-search does not require responses from LLM backend
        switch (recipeId) {
            case 'context-search':
                await this.onCompletionEnd()
                break
            default: {
                this.sendTranscript()

                const { prompt, contextFiles } = await this.transcript.getPromptForLastInteraction(
                    getPreamble(this.codebaseContext.getCodebase()),
                    this.maxPromptTokens
                )
                this.transcript.setUsedContextFilesForLastInteraction(contextFiles)
                this.sendPrompt(prompt, interaction.getAssistantMessage().prefix ?? '')
                await this.saveTranscriptToChatHistory()
            }
        }
        logEvent(`CodyVSCodeExtension:recipe:${recipe.id}:executed`)
    }

    protected async runRecipeForSuggestion(recipeId: RecipeID, humanChatInput: string = ''): Promise<void> {
        const recipe = getRecipe(recipeId)
        if (!recipe) {
            return
        }

        const multiplexer = new BotResponseMultiplexer()
        const transcript = Transcript.fromJSON(await this.transcript.toJSON())

        const interaction = await recipe.getInteraction(humanChatInput, {
            editor: this.editor,
            intentDetector: this.intentDetector,
            codebaseContext: this.codebaseContext,
            responseMultiplexer: multiplexer,
            firstInteraction: this.transcript.isEmpty,
        })
        if (!interaction) {
            return
        }
        transcript.addInteraction(interaction)

        const { prompt, contextFiles } = await transcript.getPromptForLastInteraction(
            getPreamble(this.codebaseContext.getCodebase()),
            this.maxPromptTokens
        )
        transcript.setUsedContextFilesForLastInteraction(contextFiles)

        logEvent(`CodyVSCodeExtension:recipe:${recipe.id}:executed`)

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

    private async guardrailsAnnotateAttributions(text: string): Promise<string> {
        if (!this.config.experimentalGuardrails) {
            return text
        }

        const result = await annotateAttribution(this.guardrails, text)

        // Only log telemetry if we did work (ie had to annotate something).
        if (result.codeBlocks > 0) {
            const event = {
                codeBlocks: result.codeBlocks,
                duration: result.duration,
            }
            logEvent('CodyVSCodeExtension:guardrails:annotate', event, event)
        }

        return result.text
    }

    /**
     * Send transcript to view
     */
    private sendTranscript(): void {
        const chatTranscript = this.transcript.toChat()
        this.handleTranscript(chatTranscript, this.isMessageInProgress)
    }

    private async saveTranscriptToChatHistory(): Promise<void> {
        if (this.transcript.isEmpty) {
            return
        }
        MessageProvider.chatHistory[this.currentChatID] = await this.transcript.toJSON()
        await this.saveChatHistory()
    }

    /**
     * Save chat history
     */
    private async saveChatHistory(): Promise<void> {
        const userHistory = {
            chat: MessageProvider.chatHistory,
            input: MessageProvider.inputHistory,
        }
        await this.localStorage.setChatHistory(userHistory)
    }

    /**
     * Delete history from current chat history and local storage
     */
    protected async deleteHistory(chatID: string): Promise<void> {
        delete MessageProvider.chatHistory[chatID]
        await this.localStorage.deleteChatHistory(chatID)
        this.sendHistory()
    }

    /**
     * Loads chat history from local storage
     */
    private loadChatHistory(): void {
        const localHistory = this.localStorage.getChatHistory()
        if (localHistory) {
            MessageProvider.chatHistory = localHistory?.chat
            MessageProvider.inputHistory = localHistory.input
        }
    }

    /**
     * Loads the most recent chat
     */
    private async loadRecentChat(): Promise<void> {
        const localHistory = this.localStorage.getChatHistory()
        if (localHistory) {
            const chats = localHistory.chat
            const sortedChats = Object.entries(chats).sort(
                (a, b) => +new Date(b[1].lastInteractionTimestamp) - +new Date(a[1].lastInteractionTimestamp)
            )
            const chatID = sortedChats[0][0]
            await this.restoreSession(chatID)
        }
    }

    /**
     * Send history to view
     */
    private sendHistory(): void {
        this.handleHistory({
            chat: MessageProvider.chatHistory,
            input: MessageProvider.inputHistory,
        })
    }

    /**
     * Send embedding connections or results error to output
     */
    private logEmbeddingsSearchErrors(): void {
        if (this.config.useContext !== 'embeddings') {
            return
        }
        const searchErrors = this.codebaseContext.getEmbeddingSearchErrors()
        // Display error message as assistant response for users with indexed codebase but getting search errors
        if (this.codebaseContext.checkEmbeddingsConnection() && searchErrors) {
            this.transcript.addErrorAsAssistantResponse(searchErrors)
            debug('ChatViewProvider:onLogEmbeddingsErrors', '', { verbose: searchErrors })
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

function isAbortError(error: string): boolean {
    return error === 'aborted' || error === 'socket hang up'
}
