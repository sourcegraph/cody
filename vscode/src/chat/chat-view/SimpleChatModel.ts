import * as vscode from 'vscode'

import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'

export interface MessageWithContext {
    message: Message
    newContextUsed?: ContextItem[]
}

export class SimpleChatModel {
    // private enhancedContext: ContextItem[] = []
    private messagesWithContext: MessageWithContext[] = []

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

export interface PromptMaker {
    makePrompt(chat: SimpleChatModel, context: ContextItem[]): Message[]
}

export class GPT4PromptMaker implements PromptMaker {
    public makePrompt(chat: SimpleChatModel, contextItems: ContextItem[]): Message[] {
        const promptMessages: Message[] = []
        for (const contextItem of contextItems) {
            console.log('# using file path in prompt: ' + contextItem.uri.fsPath)
            promptMessages.push(
                {
                    speaker: 'human',
                    text: 'Use the following text from file `' + contextItem.uri.fsPath + '`\n\n' + contextItem.text,
                },
                {
                    speaker: 'assistant',
                    text: 'Ok.',
                }
            )
        }
        promptMessages.push(...chat.getMessagesWithContext())
        return promptMessages
    }
}
