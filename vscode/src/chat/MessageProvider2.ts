import { spawnSync } from 'child_process'

import * as vscode from 'vscode'

import { ChatContextStatus } from '@sourcegraph/cody-shared'
import { BotResponseMultiplexer } from '@sourcegraph/cody-shared/src/chat/bot-response-multiplexer'
import { ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
import { getPreamble } from '@sourcegraph/cody-shared/src/chat/preamble'
import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { Transcript } from '@sourcegraph/cody-shared/src/chat/transcript'
import { ChatHistory, ChatMessage, UserLocalHistory } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { reformatBotMessage } from '@sourcegraph/cody-shared/src/chat/viewHelpers'
import { CodebaseContext } from '@sourcegraph/cody-shared/src/codebase-context'
import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { Editor } from '@sourcegraph/cody-shared/src/editor'
import { SourcegraphEmbeddingsSearchClient } from '@sourcegraph/cody-shared/src/embeddings/client'
import { annotateAttribution, Guardrails } from '@sourcegraph/cody-shared/src/guardrails'
import { highlightTokens } from '@sourcegraph/cody-shared/src/hallucinations-detector'
import { IntentDetector } from '@sourcegraph/cody-shared/src/intent-detector'
import { ANSWER_TOKENS, DEFAULT_MAX_TOKENS } from '@sourcegraph/cody-shared/src/prompt/constants'
import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'
import { SourcegraphGraphQLAPIClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql'
import { isError } from '@sourcegraph/cody-shared/src/utils'

import { getFullConfig } from '../configuration'
import { VSCodeEditor } from '../editor/vscode-editor'
import { logEvent } from '../event-logger'
import { FilenameContextFetcher } from '../local-context/filename-context-fetcher'
import { LocalKeywordContextFetcher } from '../local-context/local-keyword-context-fetcher'
import { debug } from '../log'
import { getRerankWithLog } from '../logged-rerank'
import { FixupTask } from '../non-stop/FixupTask'
import { IdleRecipeRunner } from '../non-stop/roles'
import { AuthProvider } from '../services/AuthProvider'
import { LocalStorage } from '../services/LocalStorageProvider'
import { SecretStorage } from '../services/SecretStorageProvider'
import { TestSupport } from '../test-support'

import { fastFilesExist } from './fastFileFinder'
import { AuthStatus, ConfigurationSubsetForWebview, defaultAuthStatus, LocalEnv } from './protocol'
import { getRecipe } from './recipes'
import { convertGitCloneURLToCodebaseName } from './utils'

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

export abstract class MessageProvider implements vscode.Disposable, IdleRecipeRunner {
    private isMessageInProgress = false
    private cancelCompletionCallback: (() => void) | null = null

    private currentChatID = ''
    protected inputHistory: string[] = []
    private chatHistory: ChatHistory = {}

    protected transcript: Transcript = new Transcript()

    // Allows recipes to hook up subscribers to process sub-streams of bot output
    protected multiplexer: BotResponseMultiplexer = new BotResponseMultiplexer()

    private configurationChangeEvent = new vscode.EventEmitter<void>()

    protected disposables: vscode.Disposable[] = []

    // Codebase-context-related state
    private currentWorkspaceRoot: string

    constructor(
        protected config: Omit<Config, 'codebase'>, // should use codebaseContext.getCodebase() rather than config.codebase
        protected chat: ChatClient,
        protected intentDetector: IntentDetector,
        protected codebaseContext: CodebaseContext,
        protected guardrails: Guardrails,
        protected editor: VSCodeEditor,
        protected secretStorage: SecretStorage,
        protected localStorage: LocalStorage,
        protected rgPath: string,
        protected authProvider: AuthProvider,
        protected todoAuthStuff: boolean
    ) {
        // chat id is used to identify chat session
        this.createNewChatID()
        this.disposables.push(this.configurationChangeEvent)

        // listen for vscode active editor change event
        this.currentWorkspaceRoot = ''
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(async () => {
                await this.updateCodebaseContext()
            }),
            vscode.workspace.onDidChangeWorkspaceFolders(async () => {
                await this.updateCodebaseContext()
            })
        )

        if (this.todoAuthStuff) {
            this.disposables.push(vscode.commands.registerCommand('cody.auth.sync', () => this.syncAuthStatus()))
        }
    }

    protected async init(): Promise<void> {
        this.loadChatHistory()
        this.getAndSendTranscript()
        this.getAndSendChatHistory()
        await this.loadRecentChat()
        await this.publishContextStatus()
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

    public onConfigurationChange(newConfig: Config): void {
        debug('ChatViewProvider:onConfigurationChange', '')
        this.config = newConfig
        const authStatus = this.authProvider.getAuthStatus()
        if (authStatus.endpoint) {
            this.config.serverEndpoint = authStatus.endpoint
        }
        this.configurationChangeEvent.fire()
    }

    public async clearAndRestartSession(): Promise<void> {
        await this.saveTranscriptToChatHistory()
        await this.setAnonymousUserID()
        this.createNewChatID()
        this.cancelCompletion()
        this.isMessageInProgress = false
        this.transcript.reset()
        this.sendSuggestions2([])
        this.getAndSendTranscript()
        this.getAndSendChatHistory()
    }

    public async clearHistory(): Promise<void> {
        this.chatHistory = {}
        this.inputHistory = []
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
        this.transcript = Transcript.fromJSON(this.chatHistory[chatID])
        await this.transcript.toJSON()
        this.getAndSendTranscript()
        this.getAndSendChatHistory()
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
                this.getAndSendTranscript()
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
                        this.currentWorkspaceRoot
                    )
                    // TODO(keegancsmith) guardrails may be slow, we need to make this async update the interaction.
                    highlightedDisplayText = await this.guardrailsAnnotateAttributions(highlightedDisplayText)
                    this.transcript.addAssistantResponse(text || '', highlightedDisplayText)
                }
                void this.onCompletionEnd()
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
                this.onCompletionEnd(true)
                void this.editor.controllers.inline.error()
                console.error(`Completion request failed: ${err}`)
            },
        })
    }

    protected cancelCompletion(): void {
        this.cancelCompletionCallback?.()
        this.cancelCompletionCallback = null
    }

    protected onCompletionEnd(ignoreEmbeddingsError: boolean = false): void {
        this.isMessageInProgress = false
        this.cancelCompletionCallback = null
        this.getAndSendTranscript()
        void this.saveTranscriptToChatHistory()
        this.getAndSendChatHistory()
        void vscode.commands.executeCommand('setContext', 'cody.reply.pending', false)
        // TODO: move this
        this.editor.controllers.inline.setResponsePending(false)
        if (!ignoreEmbeddingsError) {
            this.logEmbeddingsSearchErrors()
        }
        this.scheduleIdleRecipes()
    }

    private async updateCodebaseContext(): Promise<void> {
        if (!this.editor.getActiveTextEditor() && vscode.window.visibleTextEditors.length !== 0) {
            // these are ephemeral
            return
        }
        const workspaceRoot = this.editor.getWorkspaceRootPath()
        if (!workspaceRoot || workspaceRoot === '' || workspaceRoot === this.currentWorkspaceRoot) {
            return
        }
        this.currentWorkspaceRoot = workspaceRoot

        const codebaseContext = await getCodebaseContext(this.config, this.rgPath, this.editor, this.chat)
        if (!codebaseContext) {
            return
        }
        // after await, check we're still hitting the same workspace root
        if (this.currentWorkspaceRoot !== workspaceRoot) {
            return
        }

        this.codebaseContext = codebaseContext
        await this.publishContextStatus()
    }

    public async executeRecipe(recipeId: RecipeID, humanChatInput: string = ''): Promise<void> {
        debug('ChatViewProvider:executeRecipe', recipeId, { verbose: humanChatInput })
        if (this.isMessageInProgress) {
            this.sendError2('Cannot execute multiple recipes. Please wait for the current recipe to finish.')
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
                this.onCompletionEnd()
                break
            default: {
                this.getAndSendTranscript()

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
                this.sendSuggestions2(suggestions)
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
     * Send transcript to webview
     */
    private getAndSendTranscript(): void {
        const chatTranscript = this.transcript.toChat()
        this.sendTranscript2(chatTranscript, this.isMessageInProgress)
    }

    private async saveTranscriptToChatHistory(): Promise<void> {
        if (this.transcript.isEmpty) {
            return
        }
        this.chatHistory[this.currentChatID] = await this.transcript.toJSON()
        await this.saveChatHistory()
    }

    /**
     * Save chat history
     */
    private async saveChatHistory(): Promise<void> {
        const userHistory = {
            chat: this.chatHistory,
            input: this.inputHistory,
        }
        await this.localStorage.setChatHistory(userHistory)
    }

    /**
     * Save, verify, and sync authStatus between extension host and webview
     * activate extension when user has valid login
     */
    public async syncAuthStatus(): Promise<void> {
        const authStatus = this.authProvider.getAuthStatus()
        await this.publishConfig()
        if (authStatus.siteVersion) {
            // Update codebase context
            const codebaseContext = await getCodebaseContext(this.config, this.rgPath, this.editor, this.chat)
            if (codebaseContext) {
                this.codebaseContext = codebaseContext
                await this.publishContextStatus()
            }
        }
    }

    /**
     * Delete history from current chat history and local storage
     */
    protected async deleteHistory(chatID: string): Promise<void> {
        delete this.chatHistory[chatID]
        await this.localStorage.deleteChatHistory(chatID)
        this.getAndSendChatHistory()
    }

    /**
     * Loads chat history from local storage
     */
    private loadChatHistory(): void {
        const localHistory = this.localStorage.getChatHistory()
        if (localHistory) {
            this.chatHistory = localHistory?.chat
            this.inputHistory = localHistory.input
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
     * Sends chat history to webview
     */
    private getAndSendChatHistory(): void {
        this.sendHistory2({
            chat: this.chatHistory,
            input: this.inputHistory,
        })
    }

    /**
     * Publish the current context status to the webview.
     */
    private async publishContextStatus(): Promise<void> {
        const send = async (): Promise<void> => {
            const editorContext = this.editor.getActiveTextEditor()
            return this.sendContextStatus2({
                mode: this.config.useContext,
                connection: this.codebaseContext.checkEmbeddingsConnection(),
                codebase: this.codebaseContext.getCodebase(),
                filePath: editorContext ? vscode.workspace.asRelativePath(editorContext.filePath) : undefined,
                selection: editorContext ? editorContext.selection : undefined,
                supportsKeyword: true,
            })
        }
        this.disposables.push(vscode.window.onDidChangeTextEditorSelection(() => send()))
        return send()
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

    /**
     * Publish the config to the webview.
     */
    private async publishConfig(): Promise<void> {
        const send = async (): Promise<void> => {
            this.config = await getFullConfig(this.secretStorage, this.localStorage)

            // check if the new configuration change is valid or not
            const authStatus = this.authProvider.getAuthStatus()
            const localProcess = await this.authProvider.appDetector.getProcessInfo(authStatus.isLoggedIn)
            const configForWebview: ConfigurationSubsetForWebview & LocalEnv = {
                ...localProcess,
                debugEnable: this.config.debugEnable,
                serverEndpoint: this.config.serverEndpoint,
            }

            // update codebase context on configuration change
            await this.updateCodebaseContext()
            await this.sendConfig2(configForWebview, authStatus)
            debug('Cody:publishConfig', 'configForWebview', { verbose: configForWebview })
        }

        this.disposables.push(this.configurationChangeEvent.event(() => send()))
        await send()
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

    protected abstract sendTranscript2(transcript: ChatMessage[], messageInProgress: boolean): void

    protected abstract sendHistory2(history: UserLocalHistory): void

    protected abstract sendError2(errorMsg: string): void

    protected abstract sendSuggestions2(suggestions: string[]): void

    protected abstract sendContextStatus2(contextStatus: ChatContextStatus): Promise<void>

    protected abstract sendConfig2(
        config: ConfigurationSubsetForWebview & LocalEnv,
        authStatus: AuthStatus
    ): Promise<void>
}

/**
 * Gets codebase context for the current workspace.
 *
 * @param config Cody configuration
 * @param rgPath Path to rg (ripgrep) executable
 * @param editor Editor instance
 * @returns CodebaseContext if a codebase can be determined, else null
 */
export async function getCodebaseContext(
    config: Config,
    rgPath: string,
    editor: Editor,
    chatClient: ChatClient
): Promise<CodebaseContext | null> {
    const client = new SourcegraphGraphQLAPIClient(config)
    const workspaceRoot = editor.getWorkspaceRootPath()
    if (!workspaceRoot) {
        return null
    }
    const gitCommand = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: workspaceRoot })
    const gitOutput = gitCommand.stdout.toString().trim()
    // Get codebase from config or fallback to getting repository name from git clone URL
    const codebase = config.codebase || convertGitCloneURLToCodebaseName(gitOutput)
    if (!codebase) {
        return null
    }
    // Check if repo is embedded in endpoint
    const repoId = await client.getRepoIdIfEmbeddingExists(codebase)
    if (isError(repoId)) {
        const infoMessage = `Cody could not find embeddings for '${codebase}' on your Sourcegraph instance.\n`
        console.info(infoMessage)
        return null
    }

    const embeddingsSearch = repoId && !isError(repoId) ? new SourcegraphEmbeddingsSearchClient(client, repoId) : null
    return new CodebaseContext(
        config,
        codebase,
        embeddingsSearch,
        new LocalKeywordContextFetcher(rgPath, editor, chatClient),
        new FilenameContextFetcher(rgPath, editor, chatClient),
        undefined,
        getRerankWithLog(chatClient)
    )
}

function isAbortError(error: string): boolean {
    return error === 'aborted' || error === 'socket hang up'
}
