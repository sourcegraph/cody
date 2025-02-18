import type { Span } from '@opentelemetry/api'
import {
    // BotResponseMultiplexer,
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
    firstResultFromOperation,
    getContextForChatMessage,
    inputTextWithoutContextChipsFromPromptEditorState,
    isAbortErrorOrSocketHangUp,
    modelsService,
    ps,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { executeEdit } from '../../../edit/execute'
import { getEditor } from '../../../editor/active-editor'
import { resolveContextItems } from '../../../editor/utils/editor-context'
import { getCategorizedMentions } from '../../../prompt-builder/utils'
import { DeepCodyAgent } from '../../agentic/DeepCody'
// import { PlanningAgent } from '../../agentic/PlanningAgent'
import { ProcessManager } from '../../agentic/ProcessManager'
// import { RawTextProcessor } from '../../agentic/utils/processors'
import { ChatBuilder } from '../ChatBuilder'
import type { ChatControllerOptions } from '../ChatController'
import { type ContextRetriever, toStructuredMentions } from '../ContextRetriever'
import { type HumanInput, getPriorityContext } from '../context'
import { DefaultPrompter, type PromptInfo } from '../prompt'
import { SearchHandler } from './SearchHandler'
import type { AgentHandler, AgentHandlerDelegate, AgentRequest } from './interfaces'

export class AgenticHandler implements AgentHandler {
    constructor(
        protected modelId: string,
        protected contextRetriever: Pick<ContextRetriever, 'retrieveContext' | 'computeDidYouMean'>,
        protected readonly editor: ChatControllerOptions['editor'],
        protected chatClient: ChatControllerOptions['chatClient']
    ) {}
    private followup = ''
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
        const stepsManager = new ProcessManager(
            steps => delegate.postStatuses(steps),
            step => delegate.postRequest(step)
        )
        // All mentions we receive are either source=initial or source=user. If the caller
        // forgot to set the source, assume it's from the user.
        mentions = mentions.map(m => (m.source ? m : { ...m, source: ContextItemSource.User }))

        const contextAgent = new DeepCodyAgent(chatBuilder, this.chatClient, stepsManager)

        const contextResult = await this.agenticContext(
            contextAgent,
            requestID,
            { text: inputText, mentions },
            editorState,
            chatBuilder,
            delegate,
            signal
        )

        if (contextResult.abort) {
            delegate.postDone({ abort: contextResult.abort })
            return
        }

        if (contextResult.error) {
            delegate.postError(contextResult.error, 'transcript')
            return
        }

        this.followup = contextAgent.nextMode

        if (this.followup === 'search') {
            const search = new SearchHandler()
            await search.handle(
                {
                    requestID,
                    inputText: inputText.replace('search for', ps``),
                    mentions,
                    editorState,
                    signal,
                    chatBuilder,
                    span,
                    recorder,
                },
                delegate
            )
            delegate.postDone()
            return
        }

        const corpusContext = contextResult.contextItems ?? []
        signal.throwIfAborted()

        if (this.followup === 'edit') {
            return this.edit(requestID, inputText, delegate, corpusContext)
        }

        const { explicitMentions, implicitMentions } = getCategorizedMentions(corpusContext)
        const prompter = new DefaultPrompter(explicitMentions, implicitMentions, false)

        const { prompt, context } = await this.buildPrompt(prompter, chatBuilder, signal, 8)

        recorder.recordChatQuestionExecuted(corpusContext, { addMetadata: true, current: span })

        signal.throwIfAborted()

        this.streamAssistantResponse(
            requestID,
            prompt,
            this.modelId,
            signal,
            chatBuilder,
            delegate,
            stepsManager,
            context?.used
        )
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
        stepsManager: ProcessManager,
        context?: ContextItem[]
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
        requestID: string,
        prompt: Message[],
        model: ChatModel,
        abortSignal: AbortSignal,
        chatBuilder: ChatBuilder,
        delegate: AgentHandlerDelegate,
        stepsManager: ProcessManager,
        context?: ContextItem[]
    ): void {
        abortSignal.throwIfAborted()
        this.sendLLMRequest(
            requestID,
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
                    if (this.followup) {
                        console.log(this.followup)
                    }
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
                        abortSignal.throwIfAborted()
                    }
                },
            },
            abortSignal,
            stepsManager,
            context
        )
    }

    private async agenticContext(
        contextAgent: DeepCodyAgent,
        requestID: string,
        { text, mentions }: HumanInput,
        editorState: SerializedPromptEditorState | null,
        chatBuilder: ChatBuilder,
        delegate: AgentHandlerDelegate,
        signal: AbortSignal
    ): Promise<{
        contextItems?: ContextItem[]
        error?: Error
        abort?: boolean
    }> {
        const baseContextResult = await this.computeContext(
            requestID,
            { text, mentions },
            editorState,
            chatBuilder,
            delegate,
            signal,
            true
        )
        // Early return if basic conditions aren't met.
        if (baseContextResult.error || baseContextResult.abort) {
            return baseContextResult
        }
        // Check session and query constraints
        const queryTooShort = text.split(' ').length < 3
        if (queryTooShort) {
            return { contextItems: [] }
        }

        const baseContext = baseContextResult.contextItems ?? []
        const agenticContext = await contextAgent.getContext(requestID, signal, baseContext)
        return { contextItems: agenticContext }
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

    async edit(
        requestID: string,
        inputTextWithoutContextChips: PromptString,
        delegate: AgentHandlerDelegate,
        context: ContextItem[] = []
    ): Promise<void> {
        const editor = getEditor()?.active
        const document = editor?.document
        if (!document) {
            delegate.postError(new Error('No active editor'), 'transcript')
            delegate.postDone()
            return
        }
        // Get full file range
        const range = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
        )
        const task = await executeEdit({
            configuration: {
                document,
                range,
                userContextFiles: context,
                instruction: inputTextWithoutContextChips,
                mode: 'edit',
                intent: 'edit',
            },
        })
        if (!task) {
            delegate.postError(new Error('Failed to execute edit command'), 'transcript')
            delegate.postDone()
            return
        }

        let responseMessage = `Here is the response for the ${task.intent} instruction:\n`

        if (!task.diff && task.replacement) {
            task.diff = [
                {
                    type: 'insertion',
                    text: task.replacement,
                    range: task.originalRange,
                },
            ]
        }

        task.diff?.map(diff => {
            responseMessage += '\n```diff\n'
            if (diff.type === 'deletion') {
                responseMessage += task.document
                    .getText(diff.range)
                    .split('\n')
                    .map(line => `- ${line}`)
                    .join('\n')
            }
            if (diff.type === 'decoratedReplacement') {
                responseMessage += diff.oldText
                    .split('\n')
                    .map(line => `- ${line}`)
                    .join('\n')
                responseMessage += diff.text
                    .split('\n')
                    .map(line => `+ ${line}`)
                    .join('\n')
            }
            if (diff.type === 'insertion') {
                responseMessage += diff.text
                    .split('\n')
                    .map(line => `+ ${line}`)
                    .join('\n')
            }
            responseMessage += '\n```'
        })

        delegate.postMessageInProgress({
            speaker: 'assistant',
            text: PromptString.unsafe_fromLLMResponse(responseMessage),
        })
        delegate.postDone()
    }
}

export async function computeContextAlternatives(
    contextRetriever: Pick<ContextRetriever, 'retrieveContext'>,
    editor: ChatControllerOptions['editor'],
    { text, mentions }: HumanInput,
    editorState: SerializedPromptEditorState | null,
    span: Span,
    signal?: AbortSignal,
    skipQueryRewrite = false
): Promise<RankedContext[]> {
    // Remove context chips (repo, @-mentions) from the input text for context retrieval.
    const inputTextWithoutContextChips = editorState
        ? PromptString.unsafe_fromUserQuery(
              inputTextWithoutContextChipsFromPromptEditorState(editorState)
          )
        : text
    const structuredMentions = toStructuredMentions(mentions)
    const retrievedContextPromise = contextRetriever.retrieveContext(
        structuredMentions,
        inputTextWithoutContextChips,
        span,
        signal,
        skipQueryRewrite
    )
    const priorityContextPromise = skipQueryRewrite
        ? Promise.resolve([])
        : retrievedContextPromise
              .then(p => getPriorityContext(text, editor, p))
              .catch(() => getPriorityContext(text, editor, []))
    const openCtxContextPromise = getContextForChatMessage(text.toString(), signal)
    const [priorityContext, retrievedContext, openCtxContext] = await Promise.all([
        priorityContextPromise,
        retrievedContextPromise.catch(e => {
            throw new Error(`Failed to retrieve search context: ${e}`)
        }),
        openCtxContextPromise,
    ])

    const resolvedExplicitMentionsPromise = resolveContextItems(
        editor,
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
