import { ContextFile, ContextMessage } from '../../codebase-context/messages'
import { IPluginContext } from '../../plugins/api/types'

import { ChatMessage, InteractionMessage } from './messages'

export interface InteractionJSON {
    humanMessage: InteractionMessage
    assistantMessage: InteractionMessage
    fullContext: ContextMessage[]
    usedContextFiles: ContextFile[]
    usedPluginsContext: IPluginContext[]
    timestamp: string

    // DEPRECATED: Legacy field for backcompat, renamed to `fullContext`
    context?: ContextMessage[]
}

export class Interaction {
    constructor(
        private readonly humanMessage: InteractionMessage,
        private assistantMessage: InteractionMessage,
        private fullContext: Promise<ContextMessage[]>,
        private usedContextFiles: ContextFile[],
        public readonly timestamp: string = new Date().toISOString(),
        private usedPluginsContext: IPluginContext[] = []
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

    public setUsedContext(usedContextFiles: ContextFile[], usedPluginsContext: IPluginContext[]): void {
        this.usedContextFiles = usedContextFiles
        this.usedPluginsContext = usedPluginsContext
    }

    /**
     * Converts the interaction to chat message pair: one message from a human, one from an assistant.
     */
    public toChat(): ChatMessage[] {
        return [
            this.humanMessage,
            { ...this.assistantMessage, contextFiles: this.usedContextFiles, pluginsContext: this.usedPluginsContext },
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
            usedPluginsContext: this.usedPluginsContext,
            timestamp: this.timestamp,
        }
    }
}
