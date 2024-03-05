import { findLast } from 'lodash'

import {
    type ChatError,
    type ChatMessage,
    type ContextItem,
    type InteractionJSON,
    type Message,
    type TranscriptJSON,
    errorToChatError,
    isCodyIgnoredFile,
    reformatBotMessageForChat,
    toRangeData,
} from '@sourcegraph/cody-shared'

import type { Repo } from '../../context/repo-fetcher'
import { getChatPanelTitle } from './chat-helpers'

/**
 * Interface for a chat message with additional context.
 *
 * 🚨 SECURITY: Cody ignored files must be excluded from all context items.
 */
export interface MessageWithContext {
    message: Message

    // If set, this should be used as the display text for the message.
    // Do not access directly, prefer using the getDisplayText function
    // instead.
    displayText?: string

    // The additional context items attached to this message (which should not
    // duplicate any previous context items in the transcript). This should
    // only be defined on human messages.
    newContextUsed?: ContextItem[]

    error?: ChatError
}

export class SimpleChatModel {
    constructor(
        public modelID: string,
        private messagesWithContext: MessageWithContext[] = [],
        public readonly sessionID: string = new Date(Date.now()).toUTCString(),
        private customChatTitle?: string,
        private selectedRepos?: Repo[]
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
        lastMessage.newContextUsed = newContextUsed.filter(c => !isCodyIgnoredFile(c.uri))
    }

    public addHumanMessage(message: Omit<Message, 'speaker'>, displayText?: string): void {
        if (this.messagesWithContext.at(-1)?.message.speaker === 'human') {
            throw new Error('Cannot add a user message after a user message')
        }
        this.messagesWithContext.push({
            displayText,
            message: {
                ...message,
                speaker: 'human',
            },
        })
    }

    public addBotMessage(message: Omit<Message, 'speaker'>, displayText?: string): void {
        const lastMessage = this.messagesWithContext.at(-1)?.message
        let error: any
        // If there is no text, it could be a placeholder message for an error
        if (lastMessage?.speaker === 'assistant') {
            if (lastMessage?.text) {
                throw new Error('Cannot add a bot message after a bot message')
            }
            error = this.messagesWithContext.pop()?.error
        }
        this.messagesWithContext.push({
            displayText,
            error,
            message: {
                ...message,
                speaker: 'assistant',
            },
        })
    }

    public addErrorAsBotMessage(error: Error): void {
        const lastMessage = this.messagesWithContext.at(-1)?.message
        // Remove the last assistant message if any
        const lastAssistantMessage =
            lastMessage?.speaker === 'assistant' && this.messagesWithContext.pop()
        const assistantMessage = lastAssistantMessage || { speaker: 'assistant' }
        // Then add a new assistant message with error added
        this.messagesWithContext.push({
            error: errorToChatError(error),
            message: {
                ...assistantMessage,
                speaker: 'assistant',
            },
        })
    }

    public getLastHumanMessage(): MessageWithContext | undefined {
        return findLast(this.messagesWithContext, message => message.message.speaker === 'human')
    }

    public getLastSpeakerMessageIndex(speaker: 'human' | 'assistant'): number | undefined {
        return this.messagesWithContext.findLastIndex(message => message.message.speaker === speaker)
    }

    /**
     * Removes all messages from the given index when it matches the expected speaker.
     *
     * expectedSpeaker must match the speaker of the message at the given index.
     * This helps ensuring the intented messages are being removed.
     */
    public removeMessagesFromIndex(index: number, expectedSpeaker: 'human' | 'assistant'): void {
        if (this.isEmpty()) {
            throw new Error('SimpleChatModel.removeMessagesFromIndex: not message to remove')
        }

        const speakerAtIndex = this.messagesWithContext.at(index)?.message?.speaker
        if (speakerAtIndex !== expectedSpeaker) {
            throw new Error(
                `SimpleChatModel.removeMessagesFromIndex: expected ${expectedSpeaker}, got ${speakerAtIndex}`
            )
        }

        // Removes everything from the index to the last element
        this.messagesWithContext.splice(index)
    }

    public getMessagesWithContext(): MessageWithContext[] {
        return this.messagesWithContext
    }

    public getChatTitle(): string {
        if (this.customChatTitle) {
            return this.customChatTitle
        }
        const text = this.getLastHumanMessage()?.displayText
        if (text) {
            return getChatPanelTitle(text)
        }
        return 'New Chat'
    }

    public getCustomChatTitle(): string | undefined {
        return this.customChatTitle
    }

    public setCustomChatTitle(title: string): void {
        this.customChatTitle = title
    }

    public getSelectedRepos(): Repo[] | undefined {
        return this.selectedRepos ? this.selectedRepos.map(r => ({ ...r })) : undefined
    }

    public setSelectedRepos(repos: Repo[] | undefined): void {
        this.selectedRepos = repos ? repos.map(r => ({ ...r })) : undefined
    }

    /**
     * Serializes to the legacy transcript JSON format
     */
    public toTranscriptJSON(): TranscriptJSON {
        const interactions: InteractionJSON[] = []
        for (let i = 0; i < this.messagesWithContext.length; i += 2) {
            const humanMessage = this.messagesWithContext[i]
            const botMessage = this.messagesWithContext[i + 1]
            interactions.push(messageToInteractionJSON(humanMessage, botMessage))
        }
        const result: TranscriptJSON = {
            id: this.sessionID,
            chatModel: this.modelID,
            chatTitle: this.getCustomChatTitle(),
            lastInteractionTimestamp: this.sessionID,
            interactions,
        }
        if (this.selectedRepos) {
            result.enhancedContext = {
                selectedRepos: this.selectedRepos.map(r => ({ ...r })),
            }
        }
        return result
    }
}

function messageToInteractionJSON(
    humanMessage: MessageWithContext,
    botMessage: MessageWithContext
): InteractionJSON {
    if (humanMessage?.message?.speaker !== 'human') {
        throw new Error('SimpleChatModel.toTranscriptJSON: expected human message, got bot')
    }
    return {
        humanMessage: messageToInteractionMessage(humanMessage),
        assistantMessage:
            botMessage?.message?.speaker === 'assistant'
                ? messageToInteractionMessage(botMessage)
                : { speaker: 'assistant' },
        usedContextFiles: humanMessage.newContextUsed ?? [],
        // These fields are unused on deserialization
        fullContext: [],
        timestamp: new Date().toISOString(),
    }
}

function messageToInteractionMessage(message: MessageWithContext): ChatMessage {
    return {
        speaker: message.message.speaker,
        text: message.message.text,
        displayText: getDisplayText(message),
    }
}

export function toViewMessage(mwc: MessageWithContext): ChatMessage {
    const displayText = getDisplayText(mwc)
    return {
        ...mwc.message,
        error: mwc.error,
        displayText,
        contextFiles: (mwc.newContextUsed ?? []).map(item => ({
            ...item,
            // De-hydrate because vscode.Range serializes to `[start, end]` in JSON.
            range: toRangeData(item.range),
        })),
    }
}

function getDisplayText(mwc: MessageWithContext): string | undefined {
    if (mwc.displayText) {
        return mwc.displayText
    }
    if (mwc.message.speaker === 'assistant' && mwc.message.text) {
        return reformatBotMessageForChat(mwc.message.text, '')
    }
    return mwc.message.text
}
