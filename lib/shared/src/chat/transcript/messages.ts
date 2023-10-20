import { randomUUID } from 'crypto'

import { ContextFile, PreciseContext } from '../../codebase-context/messages'
import { Message } from '../../sourcegraph-api'

import { TranscriptJSON } from '.'

export type MessageID = string & { readonly __brand: 'MessageID' }

export interface ChatButton {
    label: string
    action: string
    onClick: (action: string) => void
}

export interface ChatMessage extends Message {
    id?: MessageID
    displayText?: string
    contextFiles?: ContextFile[]
    preciseContext?: PreciseContext[]
    buttons?: ChatButton[]
    data?: any
}

export interface InteractionMessage extends Message {
    // ugh, forget it. i will fix all of these if we get buy in
    id?: MessageID
    displayText?: string
    prefix?: string
    error?: string
}

function newMessage(
    speaker: 'human' | 'assistant',
    text?: string,
    options?: { displayText?: string; prefix?: string }
): InteractionMessage {
    return {
        id: randomUUID() as MessageID,
        speaker,
        text,
        displayText: options?.displayText,
        prefix: options?.prefix,
    }
}

export function newHumanMessage(
    text?: string,
    options?: { displayText?: string; prefix?: string }
): InteractionMessage {
    return newMessage('human', text, options)
}

export function newAssistantMessage(
    text?: string,
    options?: { displayText?: string; prefix?: string }
): InteractionMessage {
    return newMessage('assistant', text, options)
}

export interface UserLocalHistory {
    chat: ChatHistory
    input: string[]
}

export interface ChatHistory {
    [chatID: string]: TranscriptJSON
}

export interface OldChatHistory {
    [chatID: string]: ChatMessage[]
}
