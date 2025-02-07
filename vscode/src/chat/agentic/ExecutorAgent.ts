import type { Span } from '@opentelemetry/api'
import {
    BotResponseMultiplexer,
    type ChatClient,
    type ContextItem,
    type PromptMixin,
    PromptString,
    logDebug,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import { getCategorizedMentions } from '../../prompt-builder/utils'
import { ChatBuilder } from '../chat-view/ChatBuilder'
import { DefaultPrompter } from '../chat-view/prompt'
import type { CodyTool } from './CodyTool'
import { CodyToolProvider, type ToolStatusCallback } from './CodyToolProvider'
import { CODYAGENT_PROMPTS } from './prompts'
import { PlanRunner } from './utils/PlanRunner'
import type { PlanTracker } from './utils/PlanTracker'
import { RawTextProcessor, StreamProcessor } from './utils/processors'

export class ExecutorAgent {
    public static readonly id = 'agent-executor'
    public static model: string | undefined = undefined

    protected readonly multiplexer = new BotResponseMultiplexer()
    private readonly streamProcessor: StreamProcessor
    protected readonly promptMixins: PromptMixin[] = []
    protected readonly tools: CodyTool[]
    protected readonly model

    constructor(
        protected readonly tracker: PlanTracker,
        protected readonly context: ContextItem[],
        protected readonly chatBuilder: ChatBuilder,
        protected readonly chatClient: Pick<ChatClient, 'chat'>,
        protected statusCallback: ToolStatusCallback
    ) {
        this.model = this.chatBuilder.selectedModel
        this.tools = CodyToolProvider.getTools()
        this.initializeMultiplexer(this.tools)
        this.streamProcessor = new StreamProcessor(this.chatClient, this.multiplexer)
    }

    /**
     * Register the tools with the multiplexer.
     */
    protected initializeMultiplexer(tools: CodyTool[]): void {
        for (const tool of tools) {
            this.multiplexer.sub(tool.config.tags.tag.toString(), {
                onResponse: async (content: string) => tool.stream(content),
                onTurnComplete: async () => {},
            })
        }
    }

    public async run(requestID: string, chatAbortSignal: AbortSignal): Promise<void> {
        return wrapInActiveSpan('AgentLoop', async span => {
            const stepsToRun = this.tracker.getPlan().subSteps
            const steps = stepsToRun?.length ?? 0
            for (let i = 0; i < steps; i++) {
                logDebug('Executor Agent', `Running step ${i + 1} of ${steps}`, {
                    verbose: { i: stepsToRun?.[i], current: this.tracker.getCurrentStep() },
                })
                await this.step(requestID, this.tracker, span)
                chatAbortSignal.throwIfAborted()
            }
        })
    }

    public async step(requestID: string, tracker: PlanTracker, span: Span): Promise<string | undefined> {
        const chatBuilder = new ChatBuilder(this.model)

        const taskDetails = tracker.getStatusPrompt()
        const prompt = CODYAGENT_PROMPTS.orchestrator.replace(
            '{{TASK_PLACEHOLDER}}',
            PromptString.unsafe_fromLLMResponse(taskDetails)
        )

        chatBuilder.addHumanMessage({ text: prompt })
        const prompter = this.getPrompter(this.context)
        const promptData = await prompter.makePrompt(chatBuilder, 1)
        try {
            const controller = new AbortController()
            const response = await this.streamProcessor.start(
                requestID,
                promptData.prompt,
                controller.signal,
                this.model
            )
            const extracted = RawTextProcessor.extract(response, 'function_calls')
            logDebug('Executor Agent', `extracted: ${extracted}`, {
                verbose: { prompt, extracted, response, taskDetails },
            })
            if (extracted) {
                const context = await new PlanRunner(
                    tracker,
                    span,
                    this.statusCallback.onConfirmationNeeded
                ).process(extracted[0])
                logDebug('Executor Agent', 'context length', {
                    verbose: { current: this.context.length, length: extracted?.length },
                })
                if (context) {
                    this.context.push(...context)
                }
                tracker.advanceStep()
            }
            return response
        } catch (error) {
            logDebug('Executor Agent', `executable plan convertion failed: ${error}`, {
                verbose: { error },
            })
        }

        return undefined
    }

    protected getPrompter(items: ContextItem[]): DefaultPrompter {
        const { explicitMentions, implicitMentions } = getCategorizedMentions(items)
        const MAX_SEARCH_ITEMS = 30
        return new DefaultPrompter(explicitMentions, implicitMentions.slice(-MAX_SEARCH_ITEMS))
    }
}
