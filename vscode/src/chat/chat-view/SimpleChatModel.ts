import * as vscode from 'vscode'

import { TranscriptJSON } from '@sourcegraph/cody-shared/src/chat/transcript'
import { InteractionJSON } from '@sourcegraph/cody-shared/src/chat/transcript/interaction'
import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'

// TODO(beyang): note that context is only associated with human messages (like it is in the underyling LLM)
export interface MessageWithContext {
    message: Message
    newContextUsed?: ContextItem[]
}

export class SimpleChatModel {
    constructor(
        public modelID: string,
        private messagesWithContext: MessageWithContext[] = []
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
     * Serializers code
     */

    public toJSON(): SimpleChatModelJSON {
        return {
            modelID: this.modelID,
            messagesWithContext: this.messagesWithContext.map(
                (messageWithContext: MessageWithContext): MessageWithContextJSON => {
                    return {
                        message: messageWithContext.message,
                        newContextUsed: messageWithContext.newContextUsed?.map((contextItem: ContextItem) => {
                            return {
                                uri: contextItem.uri.toString(),
                                range: contextItem.range && {
                                    start: {
                                        line: contextItem.range.start.line,
                                        character: contextItem.range.start.character,
                                    },
                                    end: {
                                        line: contextItem.range.end.line,
                                        character: contextItem.range.end.character,
                                    },
                                },
                                text: contextItem.text,
                            }
                        }),
                    }
                }
            ),
        }
    }

    public static fromJSON(json: unknown): SimpleChatModel {
        if (typeof json !== 'object' || json === null) {
            throw new Error('SimpleChatModel: cannot deserialize from non-object')
        }

        if ('interactions' in json) {
            return SimpleChatModel.fromTranscriptJSON(json as TranscriptJSON)
        }

        const simpleChatModelJSON = json as SimpleChatModelJSON
        return new SimpleChatModel(
            simpleChatModelJSON.modelID,
            simpleChatModelJSON.messagesWithContext.map(
                (messageWithContextJSON: MessageWithContextJSON): MessageWithContext => {
                    return {
                        message: messageWithContextJSON.message,
                        newContextUsed: messageWithContextJSON.newContextUsed?.map(contextItemJSON => {
                            return {
                                uri: vscode.Uri.parse(contextItemJSON.uri),
                                range:
                                    contextItemJSON.range &&
                                    new vscode.Range(
                                        contextItemJSON.range.start.line,
                                        contextItemJSON.range.start.character,
                                        contextItemJSON.range.end.line,
                                        contextItemJSON.range.end.character
                                    ),
                                text: contextItemJSON.text,
                            }
                        }),
                    }
                }
            )
        )
    }

    private static fromTranscriptJSON(json: TranscriptJSON): SimpleChatModel {
        const messages: MessageWithContext[] = json.interactions.flatMap(
            (interaction: InteractionJSON): MessageWithContext[] => {
                return [
                    {
                        message: {
                            speaker: 'assistant',
                            text: interaction.assistantMessage.text,
                        },
                        // TODO: include context
                        newContextUsed: [],
                    },
                    {
                        message: {
                            speaker: 'human',
                            text: interaction.humanMessage.text,
                        },
                        // TODO: include context
                        newContextUsed: [],
                    },
                ]
            }
        )
        return new SimpleChatModel(json.chatModel || 'anthropic/claude-2', messages)
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

interface MessageWithContextJSON {
    message: Message
    newContextUsed?: {
        uri: string
        range?: {
            start: {
                line: number
                character: number
            }
            end: {
                line: number
                character: number
            }
        }
        text: string
    }[]
}

interface SimpleChatModelJSON {
    modelID: string
    messagesWithContext: MessageWithContextJSON[]
}
