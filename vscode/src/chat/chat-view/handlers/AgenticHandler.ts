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
    ps,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getDiagnosticsTextBlock, getUpdatedDiagnostics } from '../../../commands/context/diagnostic'
import { executeEdit } from '../../../edit/execute'
import { getEditor } from '../../../editor/active-editor'
import type { Edit } from '../../../non-stop/line-diff'
import { getCategorizedMentions } from '../../../prompt-builder/utils'
import { DeepCodyAgent } from '../../agentic/DeepCody'
import { ProcessManager } from '../../agentic/ProcessManager'
import { ChatBuilder } from '../ChatBuilder'
import type { ChatControllerOptions } from '../ChatController'
import type { ContextRetriever } from '../ContextRetriever'
import type { HumanInput } from '../context'
import { DefaultPrompter, type PromptInfo } from '../prompt'
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
        const { requestID, inputText, mentions, editorState, signal, chatBuilder, recorder, span } = req

        const stepsManager = new ProcessManager(
            steps => delegate.postStatuses(steps),
            step => delegate.postRequest(step)
        )
        // All mentions we receive are either source=initial or source=user. If the caller
        // forgot to set the source, assume it's from the user.
        req.mentions = mentions.map(m => (m.source ? m : { ...m, source: ContextItemSource.User }))

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

        signal.throwIfAborted()

        const { mode, query } = contextAgent.nextActionMode
        if (mode === 'search') {
            const search = new SearchHandler()
            await search.handle(
                {
                    ...req,
                    inputText: PromptString.unsafe_fromLLMResponse(query),
                },
                delegate
            )
            delegate.postDone()
            return
        }

        const corpusContext = contextResult.contextItems ?? []

        if (mode === 'edit') {
            chatBuilder.setLastMessageIntent('edit')
            // const edit = new EditChatHandler(this.modelId, this.editor, this.chatClient, corpusContext)
            // await edit.handle(req, delegate)
            this.edit(inputText, delegate, corpusContext)
            return
        }

        const { explicitMentions, implicitMentions } = getCategorizedMentions(corpusContext)
        const prompter = new DefaultPrompter(explicitMentions, implicitMentions, false)
        const { prompt, context } = await this.buildPrompt(prompter, chatBuilder, signal, 8)

        signal.throwIfAborted()

        recorder.recordChatQuestionExecuted(corpusContext, { addMetadata: true, current: span })
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

    protected async edit(
        instruction: PromptString,
        delegate: AgentHandlerDelegate,
        context: ContextItem[] = []
    ): Promise<void> {
        const editor = getEditor()?.active
        if (!editor?.document) {
            delegate.postError(new Error('No active editor'), 'transcript')
            delegate.postDone()
            return
        }

        const postProgressToWebview = (msgs: string[]) => {
            const message = msgs.join('\n\n')
            delegate.postMessageInProgress({
                speaker: 'assistant',
                text: PromptString.unsafe_fromLLMResponse(message),
                model: this.modelId,
            })
        }

        const document = editor.document
        const fullRange = document.validateRange(new vscode.Range(0, 0, document.lineCount, 0))
        let currentDiagnostics = vscode.languages.getDiagnostics()

        let attempts = 0
        const MAX_ATTEMPTS = 5
        let currentInstruction = instruction

        const messageInProgress = []

        while (attempts < MAX_ATTEMPTS) {
            attempts++

            const task = await executeEdit({
                configuration: {
                    document,
                    range: fullRange,
                    userContextFiles: context,
                    instruction: currentInstruction,
                    mode: 'edit',
                    intent: 'edit',
                },
            })

            if (!task) {
                delegate.postError(new Error('Failed to execute edit command'), 'transcript')
                delegate.postDone()
                return
            }

            const diffs =
                task.diff ||
                (task.replacement
                    ? [
                          {
                              type: 'insertion',
                              text: task.replacement,
                              range: task.originalRange,
                          },
                      ]
                    : [])

            messageInProgress.push(this.generateDiffMessage(diffs, document))
            postProgressToWebview(messageInProgress)

            await editor.document.save()

            const latestDiagnostics = vscode.languages.getDiagnostics()
            const problems = getUpdatedDiagnostics(currentDiagnostics, latestDiagnostics)

            if (!problems.length) {
                break // Success! No more problems
            }

            if (attempts < MAX_ATTEMPTS) {
                const problemText = getDiagnosticsTextBlock(problems)
                const diagnosticsBlock = PromptString.unsafe_fromLLMResponse(problemText)
                const retryMessage = `Attempt ${attempts}/${MAX_ATTEMPTS}: Found issues, trying to fix:\n${problemText}`
                messageInProgress.push(retryMessage)
                postProgressToWebview(messageInProgress)

                // Update instruction with current problems for next attempt
                currentInstruction = instruction.concat(
                    ps`\nPrevious attempt resulted in these issues:\n${diagnosticsBlock}`
                )
                currentDiagnostics = latestDiagnostics
            }
        }

        if (attempts === MAX_ATTEMPTS) {
            messageInProgress.push(
                `Reached maximum number of attempts (${MAX_ATTEMPTS}). Some issues may remain.`
            )
        }

        postProgressToWebview(messageInProgress)
        delegate.postDone()
    }

    // Helper method to generate diff message
    private generateDiffMessage(diffs: Edit[], document: vscode.TextDocument): string {
        const message = ['Here is the proposed change:\n\n```diff']
        const documentLines = document.getText().split('\n')
        const modifiedLines = new Map<number, Edit>()

        for (const diff of diffs) {
            for (let line = diff.range.start.line; line <= diff.range.end.line; line++) {
                modifiedLines.set(line, diff)
            }
        }

        for (let lineNumber = 0; lineNumber < documentLines.length; lineNumber++) {
            const diff = modifiedLines.get(lineNumber)
            if (!diff) {
                message.push(` ${documentLines[lineNumber]}`)
                continue
            }

            switch (diff.type) {
                case 'deletion':
                    if (lineNumber === diff.range.start.line) {
                        message.push(
                            document
                                .getText(diff.range)
                                .trimEnd()
                                .split('\n')
                                .map(line => `- ${line}`)
                                .join('\n')
                        )
                    }
                    break
                case 'decoratedReplacement':
                    if (lineNumber === diff.range.start.line) {
                        message.push(
                            diff.oldText
                                .trimEnd()
                                .split('\n')
                                .map(line => `- ${line}`)
                                .join('\n'),
                            diff.text
                                .trimEnd()
                                .split('\n')
                                .map(line => `+ ${line}`)
                                .join('\n')
                        )
                    }
                    break
                case 'insertion':
                    if (lineNumber === diff.range.start.line) {
                        message.push(
                            diff.text
                                .trimEnd()
                                .split('\n')
                                .map(line => `+ ${line}`)
                                .join('\n')
                        )
                    }
                    break
            }
        }

        message.push('```')
        return message.join('\n')
    }
}
