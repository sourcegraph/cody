import { ContextFile, ContextMessage, PreciseContext } from '../../codebase-context/messages'
import { PluginFunctionExecutionInfo } from '../../plugins/api/types'

import { ChatMessage, InteractionMessage } from './messages'

export interface InteractionJSON {
    humanMessage: InteractionMessage
    assistantMessage: InteractionMessage
    fullContext: ContextMessage[]
    usedContextFiles: ContextFile[]
    usedPreciseContext: PreciseContext[]
    pluginExecutionInfos: PluginFunctionExecutionInfo[]
    timestamp: string

    // DEPRECATED: Legacy field for backcompat, renamed to `fullContext`
    context?: ContextMessage[]
}

// Use case:
// - I want to understand what context was sent to Cody
// -- opening a context file highlights exactly what was used in the context
// => Add a highlighter to files to show what context was sent
// - I want to manually edit context and replay Cody responses
// - I want to stuff context for Cody to use
//
// TODO:
// Capture context as it happens in chat
// - for now, interactions.setUsedContext or toChat
// Q: How would you replay a message from the chat?
// A: Something like MessageProvider executeRecipe
// Need to plumb:
// chat view UX -> ChatViewProvider onDidReceiveMessage -> MessageProvider
// like ChatViewProvider onDidReceiveMessage 'edit' which does:
// this.transcript.removeLastInteraction()
// await this.onHumanMessageSubmitted(message.text, 'user')
//
// ContextFiles.tsx is the file context display
// problem/opportunity: ContextFiles doesn't have the region in the file that is used
// so lib/shared/src/codebase-context/messages.ts add ranges to this file
//
// transcript/index.ts getPromptForLastInteraction has the transcript truncation
// code
//
// Add a command to "add to context" which pushes an item to the pending context
// Add something to slurp the pending context into the used context
//
// Implement a viewer for those messages
// Link to the viewer in the "read files" box
// Implement replay, edit, add
// Instrument the construction of: ContextFile, PreciseContext, ContextMessage

export class Interaction {
    constructor(
        private readonly humanMessage: InteractionMessage,
        private assistantMessage: InteractionMessage,
        private fullContext: Promise<ContextMessage[]>,
        private usedContextFiles: ContextFile[],
        private usedPreciseContext: PreciseContext[] = [],
        public readonly timestamp: string = new Date().toISOString(),
        private pluginExecutionInfos: PluginFunctionExecutionInfo[] = []
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

    public setUsedContext(
        usedContextFiles: ContextFile[],
        pluginExecutionInfos: PluginFunctionExecutionInfo[],
        usedPreciseContext: PreciseContext[]
    ): void {
        this.usedContextFiles = usedContextFiles
        this.pluginExecutionInfos = pluginExecutionInfos
        this.usedPreciseContext = usedPreciseContext
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
                preciseContext: this.usedPreciseContext,
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
            usedPreciseContext: this.usedPreciseContext,
            pluginExecutionInfos: this.pluginExecutionInfos,
            timestamp: this.timestamp,
        }
    }
}
