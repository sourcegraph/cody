import { ContextFile, ContextMessage } from '../../codebase-context/messages'
import { PluginFunctionExecutionInfo } from '../../plugins/api/types'

import { ChatMessage, InteractionMessage } from './messages'

export interface InteractionJSON {
    humanMessage: InteractionMessage
    assistantMessage: InteractionMessage
    fullContext: ContextMessage[]
    usedContextFiles: ContextFile[]
    pluginExecutionInfos: PluginFunctionExecutionInfo[]
    timestamp: string

    // DEPRECATED: Legacy field for backcompat, renamed to `fullContext`
    context?: ContextMessage[]
}

export enum ResponseHandling {
    DISPLAY = 1,
    HIDE = 2,
}

export class Interaction {
    constructor(
        private readonly humanMessage: InteractionMessage,
        private assistantMessage: InteractionMessage,
        private fullContext: Promise<ContextMessage[]>,
        private usedContextFiles: ContextFile[],
        public readonly timestamp: string = new Date().toISOString(),
        private pluginExecutionInfos: PluginFunctionExecutionInfo[] = [],
        public readonly responseHandling: ResponseHandling = ResponseHandling.DISPLAY
    ) {}

    public getAssistantMessage(): InteractionMessage {
        return { ...this.assistantMessage }
    }

    public setAssistantMessage(assistantMessage: InteractionMessage): void {
        this.assistantMessage = assistantMessage
    }

    public getHumanMessage(): InteractionMessage {
        return { ...this.humanMessage }
    }

    public async getFullContext(): Promise<ContextMessage[]> {
        const msgs = await this.fullContext
        return msgs.map(msg => ({ ...msg }))
    }

    public async hasContext(): Promise<boolean> {
        const contextMessages = await this.fullContext
        return contextMessages.length > 0
    }

    public setUsedContext(usedContextFiles: ContextFile[], pluginExecutionInfos: PluginFunctionExecutionInfo[]): void {
        this.usedContextFiles = usedContextFiles
        this.pluginExecutionInfos = pluginExecutionInfos
    }

    /**
     * Converts the interaction to chat message pair: one message from a human, one from an assistant.
     */
    public toChat(): ChatMessage[] {
        return [
            this.humanMessage,
            {
                ...this.assistantMessage,
                contextFiles: this.usedContextFiles,
                pluginExecutionInfos: this.pluginExecutionInfos,
            },
        ]
    }

    public async toChatPromise(): Promise<ChatMessage[]> {
        await this.fullContext
        return this.toChat()
    }

    public async toJSON(): Promise<InteractionJSON> {
        return {
            humanMessage: this.humanMessage,
            assistantMessage: this.assistantMessage,
            fullContext: await this.fullContext,
            usedContextFiles: this.usedContextFiles,
            pluginExecutionInfos: this.pluginExecutionInfos,
            timestamp: this.timestamp,
        }
    }

    /**
     * When the interaction is complete, asks whether another LLM turn is
     * needed.
     */
    public getNextInteraction(): Interaction | undefined {
        return undefined
    }
}
