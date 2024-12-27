import type { Span } from '@opentelemetry/api'
import {
    type ChatModel,
    type CompletionParameters,
    type ContextItem,
    type ContextItemOpenCtx,
    ContextItemSource,
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
import { resolveContextItems } from '../../../editor/utils/editor-context'
import { getCategorizedMentions } from '../../../prompt-builder/utils'
import { ChatBuilder } from '../ChatBuilder'
import type { ChatControllerOptions } from '../ChatController'
import { type ContextRetriever, toStructuredMentions } from '../ContextRetriever'
import { type HumanInput, getPriorityContext } from '../context'
import { DefaultPrompter, type PromptInfo } from '../prompt'
import type { AgentHandler, AgentHandlerDelegate, AgentRequest } from './interfaces'

export class ChatHandler implements AgentHandler {
    constructor(
        protected modelId: string,
        protected contextRetriever: Pick<ContextRetriever, 'retrieveContext'>,
        protected readonly editor: ChatControllerOptions['editor'],
        protected chatClient: ChatControllerOptions['chatClient']
    ) {}

    public async handle(
        {
            requestID,
            inputText,
            mentions,
            editorState,
            signal,
            chatBuilder,
            recorder,
            span,
        }: AgentRequest,
        delegate: AgentHandlerDelegate
    ): Promise<void> {
        // All mentions we receive are either source=initial or source=user. If the caller
        // forgot to set the source, assume it's from the user.
        mentions = mentions.map(m => (m.source ? m : { ...m, source: ContextItemSource.User }))

        const contextResult = await this.computeContext(
            requestID,
            { text: inputText, mentions },
            editorState,
            chatBuilder,
            signal
        )
        if (contextResult.error) {
            delegate.postError(contextResult.error, 'transcript')
        }
        if (contextResult.abort) {
            delegate.postDone({ abort: contextResult.abort })
            return
        }
        const corpusContext = contextResult.contextItems ?? []
        signal.throwIfAborted()

        const { explicitMentions, implicitMentions } = getCategorizedMentions(corpusContext)
        const prompter = new DefaultPrompter(explicitMentions, implicitMentions, false)

        const versions = await currentSiteVersion()
        if (!versions) {
            throw new Error('unable to determine site version')
        }
        const { prompt } = await this.buildPrompt(prompter, chatBuilder, signal, versions.codyAPIVersion)

        recorder.recordChatQuestionExecuted(corpusContext, { addMetadata: true, current: span })

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
                    if (isAbortErrorOrSocketHangUp(error)) {
                        abortSignal.throwIfAborted()
                    }
                },
            },
            abortSignal
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
        requestID: string,
        { text, mentions }: HumanInput,
        editorState: SerializedPromptEditorState | null,
        _chatBuilder: ChatBuilder,
        signal?: AbortSignal
    ): Promise<{
        contextItems?: ContextItem[]
        error?: Error
        abort?: boolean
    }> {
        try {
            return wrapInActiveSpan('chat.computeContext', async span => {
                const contextAlternatives = await this.computeContextAlternatives(
                    { text, mentions },
                    editorState,
                    span,
                    signal
                )
                return { contextItems: contextAlternatives[0].items }
            })
        } catch (e) {
            return { error: new Error(`Unexpected error computing context, no context was used: ${e}`) }
        }
    }

    private async computeContextAlternatives(
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
                throw new Error(`Failed to retrieve search context: ${e}`)
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

// This is the manual ordering of the different retrieved and explicit context sources
// It should be equivalent to the ordering of things in
// ChatController:legacyComputeContext > context.ts:resolveContext
function combineContext(
    explicitMentions: ContextItem[],
    openCtxContext: ContextItemOpenCtx[],
    priorityContext: ContextItem[],
    retrievedContext: ContextItem[]
): ContextItem[] {
    return [explicitMentions, openCtxContext, priorityContext, retrievedContext].flat()
}
