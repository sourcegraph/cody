import { ContextFile, ContextMessage, PreciseContext } from '../../codebase-context/messages'

import { ChatMessage, ChatMetadata, InteractionMessage } from './messages'

export interface InteractionJSON {
    humanMessage: InteractionMessage
    assistantMessage: InteractionMessage
    fullContext: ContextMessage[]
    usedContextFiles: ContextFile[]
    usedPreciseContext: PreciseContext[]
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
        private usedPreciseContext: PreciseContext[] = [],
        public readonly timestamp: string = new Date().toISOString()
    ) {}

    private metadata?: ChatMetadata
    public setMetadata(metadata: ChatMetadata): void {
        this.metadata = metadata
        this.humanMessage.metadata = this.metadata
        this.assistantMessage.metadata = this.metadata
    }

    public getAssistantMessage(): InteractionMessage {
        return { ...this.assistantMessage }
    }

    public setAssistantMessage(assistantMessage: InteractionMessage): void {
        this.assistantMessage = { ...assistantMessage, metadata: this.metadata }
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

    public setUsedContext(usedContextFiles: ContextFile[], usedPreciseContext: PreciseContext[]): void {
        this.usedContextFiles = usedContextFiles
        this.usedPreciseContext = usedPreciseContext
    }

    /**
     * Converts the interaction to chat message pair: one message from a human, one from an assistant.
     */
    public toChat(): ChatMessage[] {
        return [
            {
                ...this.humanMessage,
                contextFiles: this.usedContextFiles,
                preciseContext: this.usedPreciseContext,
            },
            this.assistantMessage,
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
            usedPreciseContext: this.usedPreciseContext,
            timestamp: this.timestamp,
        }
    }
}
