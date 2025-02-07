import type { Span } from '@opentelemetry/api'
import {
    BotResponseMultiplexer,
    type ChatClient,
    CodyIDE,
    type ContextItem,
    ProcessType,
    type ProcessingStep,
    type PromptMixin,
    clientCapabilities,
    getClientPromptString,
    logDebug,
    newPromptMixin,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import { getCategorizedMentions } from './../../prompt-builder/utils'
import type { ChatBuilder } from './../chat-view/ChatBuilder'
import { DefaultPrompter } from './../chat-view/prompt'
import type { CodyTool } from './CodyTool'
import { CodyToolProvider, type ToolStatusCallback } from './CodyToolProvider'
import { ExecutorAgent } from './ExecutorAgent'
import type { ProcessManager } from './ProcessManager'
import { CODYAGENT_PROMPTS } from './prompts'
import { PlanTracker } from './utils/PlanTracker'
import { RawTextProcessor, StreamProcessor } from './utils/processors'

interface PlanTool {
    id: string
    params: string[]
    notes?: string
}

interface PlanStep {
    title: string
    description: string
    tools: PlanTool[]
}

interface Plan {
    title: string
    description: string
    steps: PlanStep[]
}

export class PlanningAgent {
    public static readonly id = 'planner'
    public static model: string | undefined = undefined

    protected readonly multiplexer = new BotResponseMultiplexer()
    private readonly streamProcessor: StreamProcessor
    protected readonly promptMixins: PromptMixin[] = []
    protected readonly tools: CodyTool[]

    protected context: ContextItem[] = []

    constructor(
        protected readonly chatBuilder: ChatBuilder,
        protected readonly chatClient: Pick<ChatClient, 'chat'>,
        protected statusCallback: ToolStatusCallback,
        private stepsManager: ProcessManager
    ) {
        this.statusCallback.onStream({
            title: 'Switched to Planning Agent...',
        })
        // Initialize tools, handlers and mixins in constructor
        this.tools = CodyToolProvider.getTools()

        this.initializeMultiplexer(this.tools)
        this.buildPrompt(this.tools)
        this.streamProcessor = new StreamProcessor(this.chatClient, this.multiplexer)
    }

    protected thoughtProcessor = new RawTextProcessor()

    /**
     * Register the tools with the multiplexer.
     */
    protected initializeMultiplexer(tools: CodyTool[]): void {
        // For responses enclosed in a thinking block, we will stream them
        this.multiplexer.sub('think', {
            onResponse: async (content: string) =>
                this.statusCallback.onUpdate('thought', this.thoughtProcessor.append(content)),
            onTurnComplete: async () => {
                this.statusCallback.onUpdate('thought', this.thoughtProcessor.consumeAndClear())
                this.statusCallback?.onComplete('thought')
                this.statusCallback.onStream({
                    title: 'Generating Plan...',
                })
            },
        })
    }

    /**
     * Construct the prompt based on the tools available.
     */
    protected buildPrompt(_tools: CodyTool[]): void {
        const prompt = CODYAGENT_PROMPTS.planning.replace(
            '{{CODY_IDE}}',
            getClientPromptString(clientCapabilities().agentIDE || CodyIDE.VSCode)
        )
        this.promptMixins.push(newPromptMixin(prompt))
    }

    public async getPlan(
        requestID: string,
        chatAbortSignal: AbortSignal,
        context: ContextItem[]
    ): Promise<ProcessingStep | null> {
        this.context = context
        return wrapInActiveSpan('Agent._getPlan', async span => {
            const startTime = performance.now()
            // Acitvate the thinking step
            this.statusCallback.onStream({
                id: 'thought',
                title: 'Thinking...',
                type: ProcessType.Thought,
            })
            const tracker = await this.plan(requestID, span, chatAbortSignal)
            console.log('duration', performance.now() - startTime)
            return tracker
        })
    }

    private async plan(
        requestID: string,
        span: Span,
        chatAbortSignal: AbortSignal
    ): Promise<ProcessingStep | null> {
        const prompter = this.getPrompter(this.context)
        const promptData = await prompter.makePrompt(this.chatBuilder, 1, this.promptMixins)

        try {
            const res = await this.streamProcessor.start(
                requestID,
                promptData.prompt,
                chatAbortSignal,
                this.chatBuilder.selectedModel
            )
            if (!res) return null

            // Parse the JSON plan from the response
            const planMatch = RawTextProcessor.extract(res, 'testplanjson')
            if (!planMatch.length) {
                logDebug('Planning Agent', 'No plan found in response', { verbose: res })
                return null
            }

            const planJSON = JSON.parse(planMatch[0]) as Plan
            const extractedPlan = {
                id: '',
                title: planJSON.title,
                content: planJSON.description,
                description: planJSON.description,
                state: 'pending',
                type: ProcessType.Plan,
                subSteps: planJSON.steps.map((step, index) => {
                    const stepId = `step-${index + 1}`
                    return {
                        id: stepId,
                        title: step.title,
                        content: step.description,
                        state: 'pending',
                        type: ProcessType.Action,
                        subSteps: step.tools.map((tool, i) => ({
                            id: `${stepId}-tool-${i + 1}`,
                            title:
                                this.tools.find(t => t.config.tags.tag.toString() === tool.id)?.config
                                    .title ?? tool.id,
                            content: tool.notes || tool.params.join(', '),
                            state: 'pending',
                            type: ProcessType.Tool,
                        })),
                    }
                }),
            } satisfies ProcessingStep
            const plan = this.stepsManager.addStep(extractedPlan)
            this.statusCallback.onComplete()
            return plan
        } catch (error) {
            await this.multiplexer.notifyTurnComplete()
            logDebug('Planning Agent', `plan generation failed: ${error}`)
            return null
        }
    }

    public async executePlan(
        plan: ProcessingStep,
        requestID: string,
        chatAbortSignal: AbortSignal
    ): Promise<void> {
        const tracker = PlanTracker.start(plan)

        const executor = new ExecutorAgent(
            tracker,
            this.context,
            this.chatBuilder,
            this.chatClient,
            this.statusCallback
        )

        const apporval = await this.statusCallback?.onConfirmationNeeded(plan.id, {
            ...plan,
            type: ProcessType.Plan,
        })
        if (!apporval) {
            return
        }

        await executor.run(requestID, chatAbortSignal)
        this.statusCallback.onComplete(plan.id)
    }

    protected getPrompter(items: ContextItem[]): DefaultPrompter {
        const { explicitMentions, implicitMentions } = getCategorizedMentions(items)
        const MAX_SEARCH_ITEMS = 30
        return new DefaultPrompter(explicitMentions, implicitMentions.slice(-MAX_SEARCH_ITEMS))
    }
}
