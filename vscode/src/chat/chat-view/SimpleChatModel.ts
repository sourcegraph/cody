import * as vscode from 'vscode'

import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'

export interface ContextMessage extends Message {
    context: ContextItem[]
}

export class SimpleChatModel {
    private enhancedContext: ContextItem[] = []
    private messages: ContextMessage[] = []

    public isEmpty(): boolean {
        return this.messages.length === 0
    }

    public addHumanMessage(message: Omit<Message, 'speaker'>, userContext: ContextItem[]): void {
        if (this.messages.at(-1)?.speaker === 'human') {
            throw new Error('Cannot add a user message after a user message')
        }
        this.messages.push({
            speaker: 'human',
            ...message,
            context: userContext,
        })
    }

    public addBotMessage(message: Omit<Message, 'speaker'>): void {
        if (this.messages.at(-1)?.speaker === 'assistant') {
            throw new Error('Cannot add a bot message after a bot message')
        }
        this.messages.push({
            speaker: 'assistant',
            ...message,
            context: [],
        })
    }

    public getMessages(): ContextMessage[] {
        return this.messages
    }

    public setEnhancedContext(context: ContextItem[]): void {
        this.enhancedContext = context
    }

    public getEnhancedContext(): ContextItem[] {
        return this.enhancedContext
    }
}

export interface ContextItem {
    uri: vscode.Uri
    range?: vscode.Range
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
        promptMessages.push(...chat.getMessages())
        return promptMessages
    }
}
