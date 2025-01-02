import {
    BotResponseMultiplexer,
    type ChatClient,
    type ContextItem,
    type Message,
    type ProcessingStep,
    type PromptMixin,
    type PromptString,
    newPromptMixin,
} from '@sourcegraph/cody-shared'
import { getCategorizedMentions } from '../../prompt-builder/utils'
import type { ChatBuilder } from '../chat-view/ChatBuilder'
import { DefaultPrompter } from '../chat-view/prompt'
import type { CodyTool } from './CodyTool'
import type { ToolStatusCallback } from './CodyToolProvider'
import { ProcessManager } from './ProcessManager'

export abstract class CodyChatAgent {
    protected readonly multiplexer = new BotResponseMultiplexer()
    protected readonly promptMixins: PromptMixin[] = []
    protected readonly toolHandlers: Map<string, CodyTool>
    protected statusCallback?: ToolStatusCallback
    private stepsManager?: ProcessManager

    constructor(
        protected readonly chatBuilder: ChatBuilder,
        protected readonly chatClient: Pick<ChatClient, 'chat'>,
        protected readonly tools: CodyTool[],
        protected context: ContextItem[],
        statusUpdateCallback?: (steps: ProcessingStep[]) => void
    ) {
        // Initialize handlers and mixins in constructor
        this.toolHandlers = new Map(tools.map(tool => [tool.config.tags.tag.toString(), tool]))
        this.initializeMultiplexer()
        this.promptMixins.push(newPromptMixin(this.buildPrompt()))

        this.stepsManager = new ProcessManager(steps => {
            statusUpdateCallback?.(steps)
        })
        this.statusCallback = {
            onStart: () => {
                this.stepsManager?.initializeStep()
            },
            onStream: (toolName, content) => {
                this.stepsManager?.addStep(toolName, content)
            },
            onComplete: (toolName, error) => {
                this.stepsManager?.completeStep(toolName, error)
            },
        }
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
            { model, maxTokensToSample: 4000 },
            new AbortController().signal,
            requestID
        )
        const accumulated = new StringBuilder()
        try {
            for await (const msg of stream) {
                if (signal?.aborted) break
                if (msg.type === 'change') {
                    const newText = msg.text.slice(accumulated.length)
                    accumulated.append(newText)
                    await this.processResponseText(newText)
                }

                if (msg.type === 'complete' || msg.type === 'error') {
                    if (msg.type === 'error') throw new Error('Error while streaming')
                    break
                }
            }
        } finally {
            await this.multiplexer.notifyTurnComplete()
        }

        return accumulated.toString()
    }

    protected getPrompter(items: ContextItem[]): DefaultPrompter {
        const { explicitMentions, implicitMentions } = getCategorizedMentions(items)
        const MAX_SEARCH_ITEMS = 30
        return new DefaultPrompter(explicitMentions, implicitMentions.slice(-MAX_SEARCH_ITEMS))
    }

    // Abstract methods that must be implemented by derived classes
    protected abstract buildPrompt(): PromptString
}

class StringBuilder {
    private parts: string[] = []

    append(str: string): void {
        this.parts.push(str)
    }

    toString(): string {
        return this.parts.join('')
    }

    get length(): number {
        return this.parts.reduce((acc, part) => acc + part.length, 0)
    }
}
