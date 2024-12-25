import type { Span } from '@opentelemetry/api'
import {
    type ChatModel,
    type CompletionParameters,
    type ContextItem,
    type Message,
    PromptString,
    type RankedContext,
    type SerializedPromptEditorState,
    Typewriter,
    currentSiteVersion,
    firstResultFromOperation,
    getContextForChatMessage,
    inputTextWithoutContextChipsFromPromptEditorState,
    isAbortErrorOrSocketHangUp,
    modelsService,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import { resolveContextItems } from '../../editor/utils/editor-context'
import { getCategorizedMentions } from '../../prompt-builder/utils'
import type { MessageErrorType } from '../MessageProvider'
import { ChatBuilder } from './ChatBuilder'
import { type ChatControllerOptions, combineContext } from './ChatController'
import { type ContextRetriever, toStructuredMentions } from './ContextRetriever'
import { type HumanInput, getPriorityContext } from './context'
import { DefaultPrompter, type PromptInfo } from './prompt'

const agentRegister = new Map<string, AgentHandler>()

export const registerAgent = (id: string, handler: AgentHandler) => agentRegister.set(id, handler)

interface AgentTools {
    contextRetriever: Pick<ContextRetriever, 'retrieveContext'>
    editor: ChatControllerOptions['editor']
    chatClient: ChatControllerOptions['chatClient']
}

export function getAgent(
    id: string,
    { contextRetriever, editor, chatClient }: AgentTools
): AgentHandler {
    if (!agentRegister.has(id)) {
        // If id is not found, assume it's a base model
        return new ChatHandler(id, contextRetriever, editor, chatClient)
    }
    return agentRegister.get(id)!
}

/**
 * Interface for the agent to post messages back to the user
 */
export interface AgentHandlerDelegate {
    postStatusUpdate(id: number, type: string, statusMessage: string): void
    postError(error: Error, type?: MessageErrorType): void
    postStatement(id: number, message: PromptString): void
    postDone(): void
}

export interface AgentRequest {
    chatClient: ChatControllerOptions['chatClient']

    inputText: PromptString
    mentions: ContextItem[]
    editorState: SerializedPromptEditorState | null
    chatBuilder: ChatBuilder
    signal: AbortSignal
}

interface AgentHandler {
    handle(request: AgentRequest, delegate: AgentHandlerDelegate): Promise<void>
}

export class ChatHandler implements AgentHandler {
    constructor(
        private modelId: string,
        private contextRetriever: Pick<ContextRetriever, 'retrieveContext'>,
        private readonly editor: ChatControllerOptions['editor'],
        private chatClient: ChatControllerOptions['chatClient']
    ) {}

    public async handle(
        { inputText, mentions, editorState, signal, chatBuilder, chatClient }: AgentRequest,
        delegate: AgentHandlerDelegate
    ): Promise<void> {
        const contextAlternatives = await this.computeContext(
            { text: inputText, mentions },
            editorState,
            signal
        )
        signal.throwIfAborted()
        const corpusContext = contextAlternatives[0].items
        const { explicitMentions, implicitMentions } = getCategorizedMentions(corpusContext)
        const prompter = new DefaultPrompter(explicitMentions, implicitMentions, false)

        const versions = await currentSiteVersion()
        if (!versions) {
            throw new Error('unable to determine site version')
        }
        const { prompt } = await this.buildPrompt(
            prompter,
            chatBuilder,
            signal,
            versions.codyAPIVersion,
            contextAlternatives
        )

        signal.throwIfAborted()

        this.streamAssistantResponse(prompt, this.modelId, signal, chatBuilder, delegate)
    }

    /**
     * Issue the chat request and stream the results back, updating the model and view
     * with the response.
     */
    private async sendLLMRequest(
        prompt: Message[],
        model: ChatModel,
        chatBuilder: ChatBuilder,
        callbacks: {
            update: (response: string) => void
            close: (finalResponse: string) => void
            error: (completedResponse: string, error: Error) => void
        },
        abortSignal: AbortSignal
    ): Promise<void> {
        let lastContent = ''
        const typewriter = new Typewriter({
            update: content => {
                lastContent = content
                callbacks.update(content)
            },
            close: () => {
                callbacks.close(lastContent)
            },
            error: error => {
                callbacks.error(lastContent, error)
            },
        })

        try {
            const contextWindow = await firstResultFromOperation(
                ChatBuilder.contextWindowForChat(chatBuilder)
            )

            const params = {
                model,
                maxTokensToSample: contextWindow.output,
            } as CompletionParameters

            // Set stream param only when the model is disabled for streaming.
            if (model && modelsService.isStreamDisabled(model)) {
                params.stream = false
            }

            const stream = await this.chatClient.chat(prompt, params, abortSignal)
            for await (const message of stream) {
                switch (message.type) {
                    case 'change': {
                        typewriter.update(message.text)
                        break
                    }
                    case 'complete': {
                        typewriter.close()
                        typewriter.stop()
                        break
                    }
                    case 'error': {
                        typewriter.close()
                        typewriter.stop(message.error)
                    }
                }
            }
        } catch (error: unknown) {
            typewriter.close()
            typewriter.stop(isAbortErrorOrSocketHangUp(error as Error) ? undefined : (error as Error))
        }
    }

    private streamAssistantResponse(
        prompt: Message[],
        model: ChatModel,
        abortSignal: AbortSignal,
        chatBuilder: ChatBuilder,
        delegate: AgentHandlerDelegate
    ): void {
        abortSignal.throwIfAborted()
        this.sendLLMRequest(
            prompt,
            model,
            chatBuilder,
            {
                update: content => {
                    delegate.postStatement(0, PromptString.unsafe_fromLLMResponse(content))
                },
                close: content => {
                    delegate.postDone()
                },
                error: (partialResponse, error) => {
                    delegate.postError(error, 'transcript')
                    if (isAbortErrorOrSocketHangUp(error)) {
                        abortSignal.throwIfAborted()
                    }
                    // try {
                    //     // We should still add the partial response if there was an error
                    //     // This'd throw an error if one has already been added
                    //     this.addBotMessage(
                    //         requestID,
                    //         PromptString.unsafe_fromLLMResponse(partialResponse),
                    //         model
                    //     )
                    // } catch {
                    //     console.error('Streaming Error', error)
                    // }
                },
            },
            abortSignal
        )
    }

    private async buildPrompt(
        prompter: DefaultPrompter,
        chatBuilder: ChatBuilder,
        abortSignal: AbortSignal,
        codyApiVersion: number,
        contextAlternatives?: RankedContext[]
    ): Promise<PromptInfo> {
        const { prompt, context } = await prompter.makePrompt(chatBuilder, codyApiVersion)
        abortSignal.throwIfAborted()

        // Update UI based on prompt construction. Includes the excluded context items to display in the UI
        chatBuilder.setLastMessageContext([...context.used, ...context.ignored], contextAlternatives)

        return { prompt, context }
    }

    private postError(error: Error): void {
        throw new Error('Method not implemented.')
    }

    private async computeContext(
        { text, mentions }: HumanInput,
        editorState: SerializedPromptEditorState | null,
        signal?: AbortSignal
    ): Promise<RankedContext[]> {
        try {
            return wrapInActiveSpan('chat.computeContext', span => {
                return this._computeContext({ text, mentions }, editorState, span, signal)
            })
        } catch (e) {
            this.postError(new Error(`Unexpected error computing context, no context was used: ${e}`))
            return [
                {
                    strategy: 'none',
                    items: [],
                },
            ]
        }
    }

    private async _computeContext(
        { text, mentions }: HumanInput,
        editorState: SerializedPromptEditorState | null,
        span: Span,
        signal?: AbortSignal
    ): Promise<RankedContext[]> {
        // Remove context chips (repo, @-mentions) from the input text for context retrieval.
        const inputTextWithoutContextChips = editorState
            ? PromptString.unsafe_fromUserQuery(
                  inputTextWithoutContextChipsFromPromptEditorState(editorState)
              )
            : text
        const structuredMentions = toStructuredMentions(mentions)
        const retrievedContextPromise = this.contextRetriever.retrieveContext(
            structuredMentions,
            inputTextWithoutContextChips,
            span,
            signal
        )
        const priorityContextPromise = retrievedContextPromise
            .then(p => getPriorityContext(text, this.editor, p))
            .catch(() => getPriorityContext(text, this.editor, []))
        const openCtxContextPromise = getContextForChatMessage(text.toString(), signal)
        const [priorityContext, retrievedContext, openCtxContext] = await Promise.all([
            priorityContextPromise,
            retrievedContextPromise.catch(e => {
                this.postError(new Error(`Failed to retrieve search context: ${e}`))
                return []
            }),
            openCtxContextPromise,
        ])

        const resolvedExplicitMentionsPromise = resolveContextItems(
            this.editor,
            [structuredMentions.symbols, structuredMentions.files, structuredMentions.openCtx].flat(),
            text,
            signal
        )

        return [
            {
                strategy: 'local+remote',
                items: combineContext(
                    await resolvedExplicitMentionsPromise,
                    openCtxContext,
                    priorityContext,
                    retrievedContext
                ),
            },
        ]
    }
}
