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
    uri: vscode.Uri
    range: vscode.Range
    text: string
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
        promptMessages.push(...chat.messages)
        return promptMessages
    }
}
