import {
    // BotResponseMultiplexer,
    type ChatModel,
    type CompletionParameters,
    type ContextItem,
    ContextItemSource,
    type Message,
    PromptString,
    type SerializedPromptEditorState,
    Typewriter,
    firstResultFromOperation,
    isAbortErrorOrSocketHangUp,
    modelsService,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import { getCategorizedMentions } from '../../../prompt-builder/utils'
import { DeepCodyAgent, type OmniboxAgentResponse } from '../../agentic/DeepCody'
import { ProcessManager } from '../../agentic/ProcessManager'
import { ChatBuilder } from '../ChatBuilder'
import type { ChatControllerOptions } from '../ChatController'
import type { ContextRetriever } from '../ContextRetriever'
import type { HumanInput } from '../context'
import { DefaultPrompter, type PromptInfo } from '../prompt'
import { AgenticEditHandler } from './AgenticEditHandler'
import { computeContextAlternatives } from './ChatHandler'
import { SearchHandler } from './SearchHandler'
import type { AgentHandler, AgentHandlerDelegate, AgentRequest } from './interfaces'

export class AgenticHandler implements AgentHandler {
    constructor(
        protected modelId: string,
        protected contextRetriever: Pick<ContextRetriever, 'retrieveContext' | 'computeDidYouMean'>,
        protected readonly editor: ChatControllerOptions['editor'],
        protected chatClient: ChatControllerOptions['chatClient']
    ) {}

    public async handle(req: AgentRequest, delegate: AgentHandlerDelegate): Promise<void> {
        const { mentions, signal } = req

        const stepsManager = new ProcessManager(
            steps => delegate.postStatuses(steps),
            step => delegate.postRequest(step)
        )
        // All mentions we receive are either source=initial or source=user. If the caller
        // forgot to set the source, assume it's from the user.
        req.mentions = mentions.map(m => (m.source ? m : { ...m, source: ContextItemSource.User }))

        const reflection = await this.reflection(req, delegate, stepsManager)
        if (reflection.abort) {
            delegate.postDone({ abort: reflection.abort })
            return
        }
        if (reflection.error) {
            delegate.postError(reflection.error, 'transcript')
            return
        }

        signal.throwIfAborted()
        this.processActionMode(reflection, req, delegate, stepsManager)
    }

    private async reflection(
        req: AgentRequest,
        delegate: AgentHandlerDelegate,
        stepsManager: ProcessManager
    ): Promise<OmniboxAgentResponse> {
        const { requestID, inputText, mentions, editorState, signal, chatBuilder } = req
        const baseContextResult = await this.computeContext(
            requestID,
            { text: inputText, mentions },
            editorState,
            chatBuilder,
            delegate,
            signal,
            true
        )
        const baseContext = baseContextResult.contextItems
        // Early return if basic conditions aren't met.
        if (baseContextResult.error || baseContextResult.abort || !baseContext) {
            return { ...baseContextResult }
        }

        const agent = new DeepCodyAgent(req.chatBuilder, this.chatClient, stepsManager)

        return await agent.start(requestID, signal, baseContext)
    }

    private async processActionMode(
        agentResponse: OmniboxAgentResponse,
        req: AgentRequest,
        delegate: AgentHandlerDelegate,
        stepsManager: ProcessManager
    ): Promise<void> {
        const { mode, query } = agentResponse.next ?? {}
        const corpusContext = agentResponse.contextItems ?? []
        // Search mode
        if (mode === 'search' && query) {
            const search = new SearchHandler()
            req.inputText = PromptString.unsafe_fromLLMResponse(query)
            await search.handle(req, delegate)
            delegate.postDone()
            return
        }
        // Edit mode
        if (mode === 'edit') {
            req.chatBuilder.setLastMessageIntent('edit')
            // const edit = new EditChatHandler(this.modelId, this.editor, this.chatClient, corpusContext)
            // await edit.handle(req, delegate)
            await new AgenticEditHandler(this.modelId).handle(req, delegate)
            return
        }
        // Chat mode
        req.signal.throwIfAborted()
        req.recorder.recordChatQuestionExecuted(corpusContext, { addMetadata: true, current: req.span })
        const { explicitMentions, implicitMentions } = getCategorizedMentions(corpusContext)
        const prompter = new DefaultPrompter(explicitMentions, implicitMentions, false)
        const { prompt } = await this.buildPrompt(prompter, req.chatBuilder, req.signal, 8)
        this.streamAssistantResponse(req, prompt, this.modelId, delegate, stepsManager)
    }

    /**
     * Issue the chat request and stream the results back, updating the model and view
     * with the response.
     */
    private async sendLLMRequest(
        requestID: string,
        prompt: Message[],
        model: ChatModel,
        chatBuilder: ChatBuilder,
        callbacks: {
            update: (response: string) => void
            close: (finalResponse: string) => void
            error: (completedResponse: string, error: Error) => void
        },
        abortSignal: AbortSignal,
        stepsManager: ProcessManager
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

            const stream = await this.chatClient.chat(prompt, params, abortSignal, requestID)
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
        req: AgentRequest,
        prompt: Message[],
        model: ChatModel,
        delegate: AgentHandlerDelegate,
        stepsManager: ProcessManager
    ): void {
        req.signal.throwIfAborted()
        this.sendLLMRequest(
            req.requestID,
            prompt,
            model,
            req.chatBuilder,
            {
                update: content => {
                    delegate.postMessageInProgress({
                        speaker: 'assistant',
                        text: PromptString.unsafe_fromLLMResponse(content),
                        model: this.modelId,
                    })
                },
                close: content => {
                    delegate.postMessageInProgress({
                        speaker: 'assistant',
                        text: PromptString.unsafe_fromLLMResponse(content),
                        model: this.modelId,
                    })
                    delegate.postDone()
                },
                error: (partialResponse, error) => {
                    delegate.postError(error, 'transcript')
                    // We should still add the partial response if there was an error
                    // This'd throw an error if one has already been added
                    delegate.postMessageInProgress({
                        speaker: 'assistant',
                        text: PromptString.unsafe_fromLLMResponse(partialResponse),
                        model: this.modelId,
                    })
                    delegate.postDone()
                    if (isAbortErrorOrSocketHangUp(error)) {
                        req.signal.throwIfAborted()
                    }
                },
            },
            req.signal,
            stepsManager
        )
    }

    private async buildPrompt(
        prompter: DefaultPrompter,
        chatBuilder: ChatBuilder,
        abortSignal: AbortSignal,
        codyApiVersion: number
    ): Promise<PromptInfo> {
        const { prompt, context } = await prompter.makePrompt(chatBuilder, codyApiVersion)
        abortSignal.throwIfAborted()

        // Update UI based on prompt construction. Includes the excluded context items to display in the UI
        chatBuilder.setLastMessageContext([...context.used, ...context.ignored])

        return { prompt, context }
    }

    // Overridable by subclasses that want to customize context computation
    protected async computeContext(
        _requestID: string,
        { text, mentions }: HumanInput,
        editorState: SerializedPromptEditorState | null,
        _chatBuilder: ChatBuilder,
        _delegate: AgentHandlerDelegate,
        signal?: AbortSignal,
        skipQueryRewrite = false
    ): Promise<{
        contextItems?: ContextItem[]
        error?: Error
        abort?: boolean
    }> {
        try {
            return wrapInActiveSpan('chat.computeContext', async span => {
                const contextAlternatives = await computeContextAlternatives(
                    this.contextRetriever,
                    this.editor,
                    { text, mentions },
                    editorState,
                    span,
                    signal,
                    skipQueryRewrite
                )
                return { contextItems: contextAlternatives[0].items }
            })
        } catch (e) {
            return { error: new Error(`Unexpected error computing context, no context was used: ${e}`) }
        }
    }
}
