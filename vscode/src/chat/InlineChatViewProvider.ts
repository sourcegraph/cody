import * as vscode from 'vscode'

import { BotResponseMultiplexer } from '@sourcegraph/cody-shared/src/chat/bot-response-multiplexer'
import { ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
import { getPreamble } from '@sourcegraph/cody-shared/src/chat/preamble'
import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { Transcript } from '@sourcegraph/cody-shared/src/chat/transcript'
import { reformatBotMessage } from '@sourcegraph/cody-shared/src/chat/viewHelpers'
import { CodebaseContext } from '@sourcegraph/cody-shared/src/codebase-context'
import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { annotateAttribution, Guardrails } from '@sourcegraph/cody-shared/src/guardrails'
import { highlightTokens } from '@sourcegraph/cody-shared/src/hallucinations-detector'
import { IntentDetector } from '@sourcegraph/cody-shared/src/intent-detector'
import { ANSWER_TOKENS, DEFAULT_MAX_TOKENS } from '@sourcegraph/cody-shared/src/prompt/constants'
import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'

import { VSCodeEditor } from '../editor/vscode-editor'
import { logEvent } from '../event-logger'
import { debug } from '../log'
import { AuthProvider } from '../services/AuthProvider'

import { ChatViewProviderWebview } from './ChatViewProvider'
import { fastFilesExist } from './fastFileFinder'
import { defaultAuthStatus } from './protocol'
import { getRecipe } from './recipes'

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

export class InlineChatViewProvider implements vscode.Disposable {
    private isMessageInProgress = false
    private cancelCompletionCallback: (() => void) | null = null

    private transcript: Transcript = new Transcript()

    // Allows recipes to hook up subscribers to process sub-streams of bot output
    private multiplexer: BotResponseMultiplexer = new BotResponseMultiplexer()

    private disposables: vscode.Disposable[] = []

    // Codebase-context-related state
    private currentWorkspaceRoot: string

    constructor(
        private config: Omit<Config, 'codebase'>, // should use codebaseContext.getCodebase() rather than config.codebase
        private chat: ChatClient,
        private intentDetector: IntentDetector,
        private codebaseContext: CodebaseContext,
        private guardrails: Guardrails,
        private editor: VSCodeEditor,
        private rgPath: string,
        private authProvider: AuthProvider,
        private webview?: ChatViewProviderWebview
    ) {
        // listen for vscode active editor change event
        this.currentWorkspaceRoot = ''
    }

    private sendPrompt(promptMessages: Message[], responsePrefix = ''): void {
        this.cancelCompletion()
        // TODO: This will make all inline chats look like they are pending, I think?
        void vscode.commands.executeCommand('setContext', 'cody.inline-reply.pending', true)
        this.editor.controllers.inline.setResponsePending(true)

        let text = ''

        this.multiplexer.sub(BotResponseMultiplexer.DEFAULT_TOPIC, {
            onResponse: (content: string) => {
                text += content
                const displayText = reformatBotMessage(text, responsePrefix)
                this.transcript.addAssistantResponse(displayText)
                this.editor.controllers.inline.reply(displayText, 'streaming')
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
                        this.currentWorkspaceRoot
                    )
                    // TODO(keegancsmith) guardrails may be slow, we need to make this async update the interaction.
                    highlightedDisplayText = await this.guardrailsAnnotateAttributions(highlightedDisplayText)
                    this.transcript.addAssistantResponse(text || '', highlightedDisplayText)
                    this.editor.controllers.inline.reply(highlightedDisplayText, 'complete')
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
                debug('InlineChatViewProvider:onError', err)

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
                    debug('InlineChatViewProvider:onError:unauth', err, { verbose: { authStatus } })
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

    private cancelCompletion(): void {
        this.cancelCompletionCallback?.()
        this.cancelCompletionCallback = null
    }

    private onCompletionEnd(ignoreEmbeddingsError: boolean = false): void {
        this.isMessageInProgress = false
        this.cancelCompletionCallback = null
        void vscode.commands.executeCommand('setContext', 'cody.inline-reply.pending', false)
    }

    public async executeRecipe(recipeId: RecipeID, humanChatInput: string = ''): Promise<void> {
        debug('InlineChatViewProvider:executeRecipe', recipeId, { verbose: humanChatInput })
        if (this.isMessageInProgress) {
            this.sendError('Cannot execute multiple recipes. Please wait for the current recipe to finish.')
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
        this.transcript.addInteraction(interaction)

        // Check whether or not to connect to LLM backend for responses
        // Ex: performing fuzzy / context-search does not require responses from LLM backend
        switch (recipeId) {
            case 'context-search':
                this.onCompletionEnd()
                break
            default: {
                const { prompt, contextFiles } = await this.transcript.getPromptForLastInteraction(
                    getPreamble(this.codebaseContext.getCodebase()),
                    this.maxPromptTokens
                )
                this.transcript.setUsedContextFilesForLastInteraction(contextFiles)
                this.sendPrompt(prompt, interaction.getAssistantMessage().prefix ?? '')
            }
        }
        logEvent(`CodyVSCodeExtension:recipe:${recipe.id}:executed`)
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
    private sendTranscript(): void {
        void this.webview?.postMessage({
            type: 'transcript',
            messages: this.transcript.toChat(),
            isMessageInProgress: false,
        })
    }

    /**
     * Display error message as response
     * TODO: Should this display differently to human response? The chat one does
     */
    public sendError(errorMsg: string): void {
        this.editor.controllers.inline.reply(errorMsg, 'error')
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
