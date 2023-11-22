import * as vscode from 'vscode'

import { TranscriptJSON } from '@sourcegraph/cody-shared/src/chat/transcript'
import { InteractionJSON } from '@sourcegraph/cody-shared/src/chat/transcript/interaction'
import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'

import { contextItemsToContextFiles } from './helpers'

// TODO(beyang): note that context is only associated with human messages (like it is in the underyling LLM)
export interface MessageWithContext {
    message: Message
    newContextUsed?: ContextItem[]
}

export class SimpleChatModel {
    constructor(
        public modelID: string,
        private messagesWithContext: MessageWithContext[] = [],
        public readonly sessionID: string = new Date(Date.now()).toUTCString()
    ) {}

    public isEmpty(): boolean {
        return this.messagesWithContext.length === 0
    }

    public setNewContextUsed(newContextUsed: ContextItem[]): void {
        const lastMessage = this.messagesWithContext.at(-1)
        if (!lastMessage) {
            throw new Error('no last message')
        }
        if (lastMessage.message.speaker !== 'human') {
            throw new Error('Cannot set new context used for bot message')
        }
        lastMessage.newContextUsed = newContextUsed
    }

    public addHumanMessage(message: Omit<Message, 'speaker'>): void {
        if (this.messagesWithContext.at(-1)?.message.speaker === 'human') {
            throw new Error('Cannot add a user message after a user message')
        }
        this.messagesWithContext.push({
            message: {
                speaker: 'human',
                ...message,
            },
        })
    }

    public addBotMessage(message: Omit<Message, 'speaker'>): void {
        if (this.messagesWithContext.at(-1)?.message.speaker === 'assistant') {
            throw new Error('Cannot add a bot message after a bot message')
        }
        this.messagesWithContext.push({
            message: {
                speaker: 'assistant',
                ...message,
            },
        })
    }

    public getMessagesWithContext(): MessageWithContext[] {
        return this.messagesWithContext
    }

    /**
     * Serializes to the legacy transcript JSON format
     */
    public toTranscriptJSON(): TranscriptJSON {
        const interactions: InteractionJSON[] = []
        for (let i = 0; i < this.messagesWithContext.length; i += 2) {
            const humanMessage = this.messagesWithContext[i]
            const botMessage = this.messagesWithContext[i + 1]
            if (humanMessage.message.speaker !== 'human') {
                throw new Error('SimpleChatModel.toTranscriptJSON: expected human message, got bot')
            }
            if (botMessage.message.speaker !== 'assistant') {
                throw new Error('SimpleChatModel.toTranscriptJSON: expected bot message, got human')
            }
            interactions.push({
                humanMessage: {
                    speaker: humanMessage.message.speaker,
                    text: humanMessage.message.text,
                    displayText: humanMessage.message.text,
                },
                assistantMessage: {
                    speaker: botMessage.message.speaker,
                    text: botMessage.message.text,
                    displayText: botMessage.message.text,
                },
                usedContextFiles: contextItemsToContextFiles(humanMessage.newContextUsed ?? []),

                // These fields are unused on deserialization
                fullContext: [],
                usedPreciseContext: [],
                timestamp: 'n/a',
            })
        }
        return {
            id: this.sessionID,
            chatModel: this.modelID,
            lastInteractionTimestamp: this.sessionID,
            interactions,
        }
    }
}

export interface ContextItem {
    uri: vscode.Uri
    range?: vscode.Range
    text: string
}

export function contextItemId(contextItem: ContextItem): string {
    return contextItem.range
        ? `${contextItem.uri.toString()}#${contextItem.range.start.line}:${contextItem.range.end.line}`
        : contextItem.uri.toString()
}
