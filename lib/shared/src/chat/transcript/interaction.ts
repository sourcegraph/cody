import { type ContextFile, type ContextMessage, type PreciseContext } from '../../codebase-context/messages'
import { isCodyIgnoredFile } from '../context-filter'

import { type ChatMessage, type InteractionMessage } from './messages'

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

    /**
     * Removes context messages for files that should be ignored.
     *
     * Loops through the context messages and builds a new array, omitting any
     * messages for files that match the CODY_IGNORE files filter.
     * Also omits the assistant message after any ignored human message.
     *
     * This ensures context from ignored files does not get used.
     */
    private async removeCodyIgnoredFiles(): Promise<ContextMessage[]> {
        const contextMessages = await this.fullContext
        const newMessages = []
        for (let i = 0; i < contextMessages.length; i++) {
            const message = contextMessages[i]
            // Skips the assistant message if the human message is ignored
            if (message.speaker === 'human' && message.file) {
                if (isCodyIgnoredFile(message.file.uri)) {
                    i++
                    continue
                }
            }
            newMessages.push(message)
        }
        this.fullContext = Promise.resolve(newMessages)
        return newMessages
    }

    public getAssistantMessage(): InteractionMessage {
        return { ...this.assistantMessage }
    }

    public setAssistantMessage(assistantMessage: InteractionMessage): void {
        this.assistantMessage = { ...assistantMessage }
    }

    public getHumanMessage(): InteractionMessage {
        return { ...this.humanMessage }
    }

    public async getFullContext(): Promise<ContextMessage[]> {
        const msgs = await this.removeCodyIgnoredFiles()
        return msgs.map(msg => ({ ...msg }))
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
            {
                ...this.assistantMessage,
                contextFiles: this.usedContextFiles,
                preciseContext: this.usedPreciseContext,
            },
        ]
    }
}
