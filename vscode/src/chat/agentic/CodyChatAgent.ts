import {
    BotResponseMultiplexer,
    type ChatClient,
    type ContextItem,
    type Message,
    type ProcessingStep,
    type PromptMixin,
    type PromptString,
    errorToChatError,
    newPromptMixin,
} from '@sourcegraph/cody-shared'
import { getCategorizedMentions } from '../../prompt-builder/utils'
import type { ChatBuilder } from '../chat-view/ChatBuilder'
import { DefaultPrompter } from '../chat-view/prompt'
import type { CodyTool } from './CodyTool'
import type { ToolStatusCallback } from './CodyToolProvider'

export abstract class CodyChatAgent {
    protected readonly multiplexer = new BotResponseMultiplexer()
    protected readonly promptMixins: PromptMixin[] = []
    protected readonly toolHandlers: Map<string, CodyTool>
    protected statusCallback?: ToolStatusCallback
    protected postMessageCallback?: (model: string) => void

    constructor(
        protected readonly chatBuilder: ChatBuilder,
        protected readonly chatClient: Pick<ChatClient, 'chat'>,
        protected readonly tools: CodyTool[],
        protected context: ContextItem[] = []
    ) {
        // Initialize handlers and mixins in constructor
        this.toolHandlers = new Map(tools.map(tool => [tool.config.tags.tag.toString(), tool]))
        this.initializeMultiplexer()
        this.promptMixins.push(newPromptMixin(this.buildPrompt()))
    }

    protected initializeMultiplexer(): void {
        for (const [tag, tool] of this.toolHandlers) {
            this.multiplexer.sub(tag, {
                onResponse: async (content: string) => tool.stream(content),
                onTurnComplete: async () => {},
            })
        }
    }

    protected async processResponseText(text: string): Promise<void> {
        return this.multiplexer.publish(text)
    }

    protected async processStream(
        requestID: string,
        message: Message[],
        signal?: AbortSignal,
        model?: string
    ): Promise<string> {
        const stream = await this.chatClient.chat(
            message,
            { model: model, maxTokensToSample: 4000 },
            new AbortController().signal,
            requestID
        )

        let accumulated = ''
        for await (const msg of stream) {
            if (signal?.aborted) break

            if (msg.type === 'change') {
                const newText = msg.text.slice(accumulated.length)
                accumulated += newText
                await this.processResponseText(newText)
            } else if (msg.type === 'complete' || msg.type === 'error') {
                await this.multiplexer.notifyTurnComplete()
                if (msg.type === 'error') throw new Error('Error while streaming')
                break
            }
        }

        return accumulated
    }

    protected getPrompter(items: ContextItem[]): DefaultPrompter {
        const { explicitMentions, implicitMentions } = getCategorizedMentions(items)
        const MAX_SEARCH_ITEMS = 30
        return new DefaultPrompter(explicitMentions, implicitMentions.slice(-MAX_SEARCH_ITEMS))
    }

    // Abstract methods that must be implemented by derived classes
    protected abstract buildPrompt(): PromptString

    public setStatusCallback(postMessage: (model: string) => void): void {
        this.postMessageCallback = postMessage

        const model = this.chatBuilder.selectedModel ?? ''
        let steps = this.chatBuilder.getLastMessageSteps() ?? []

        const createStep = (data: Partial<ProcessingStep>): ProcessingStep => ({
            content: data.content ?? '',
            id: data.id ?? '',
            step: data.step ?? 0,
            status: data.status ?? 'pending',
        })

        this.statusCallback = {
            onToolsStart: () => {
                // Initialize steps array with an empty pending step
                steps = [createStep({ status: 'pending', step: 0 })]
                this.updateStepsAndNotify(steps, model)
            },
            onToolStream: (toolName, content) => {
                steps.push(createStep({ content, id: toolName, step: 1 }))
                this.updateStepsAndNotify(steps, model)
            },
            onToolExecuted: toolName => {
                steps = steps.map(step => (step.id === toolName ? { ...step, status: 'success' } : step))
                this.updateStepsAndNotify(steps, model)
            },
            onToolsComplete: () => {
                steps = steps.map(step => ({
                    ...step,
                    status: step.status === 'error' ? step.status : 'success',
                }))
                this.updateStepsAndNotify(steps, model)
            },
            onToolError: (toolName, error) => {
                steps = steps.map(step =>
                    step.id === toolName && step.status === 'pending'
                        ? { ...step, status: 'error', error: errorToChatError(error) }
                        : step
                )
                this.updateStepsAndNotify(steps, model)
            },
        }
    }

    private updateStepsAndNotify(steps: ProcessingStep[], model: string): void {
        this.chatBuilder.setLastMessageSteps(steps)
        this.postMessageCallback?.(model)
    }
}
