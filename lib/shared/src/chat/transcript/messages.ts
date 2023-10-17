import { ContextFile, PreciseContext } from '../../codebase-context/messages'
import { Message } from '../../sourcegraph-api'

import { TranscriptJSON } from '.'

export interface ChatButton {
    label: string
    action: string
    onClick: (action: string) => void
}

export interface ChatMessage extends Message {
    displayText?: string
    contextFiles?: ContextFile[]
    preciseContext?: PreciseContext[]
    buttons?: ChatButton[]
    data?: any
    source?: string
}

export interface InteractionMessage extends Message {
    displayText?: string
    prefix?: string
    error?: string
    source?: string
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
