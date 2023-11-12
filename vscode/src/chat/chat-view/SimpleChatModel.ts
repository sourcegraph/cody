import * as vscode from 'vscode'

import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'

export class SimpleChatModel {
    public context: ContextItem[] = []
    public messages: Message[] = []

    public addHumanMessage(message: Omit<Message, 'speaker'>): void {
        if (this.messages.at(-1)?.speaker === 'human') {
            throw new Error('Cannot add a user message after a user message')
        }
        this.messages.push({
            speaker: 'human',
            ...message,
        })
    }

    public addBotMessage(message: Omit<Message, 'speaker'>): void {
        if (this.messages.at(-1)?.speaker === 'assistant') {
            throw new Error('Cannot add a bot message after a bot message')
        }
        this.messages.push({
            speaker: 'assistant',
            ...message,
        })
    }
}

export interface ContextItem {
    uri: string
    range: vscode.Range
    text: string
}

export interface PromptMaker {
    makePrompt(chat: SimpleChatModel, context: ContextItem[]): Message[]
}

export class GPT4PromptMaker implements PromptMaker {
    public makePrompt(chat: SimpleChatModel, context: ContextItem[]): Message[] {
        return chat.messages
    }
}
