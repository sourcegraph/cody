import { ContextFile, PreciseContext } from '../../codebase-context/messages'
import { Message } from '../../sourcegraph-api'
import { CodyDefaultCommands } from '../prompts'
import { RecipeID } from '../recipes/recipe'

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
    metadata?: ChatMetadata
}

export interface InteractionMessage extends Message {
    displayText?: string
    prefix?: string
    error?: string
    metadata?: ChatMetadata
}

export interface ChatMetadata {
    source?: ChatEventSource
    requestID?: string
    chatModel?: string
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

export type ChatEventSource =
    | 'chat'
    | 'inline-chat'
    | 'editor'
    | 'menu'
    | 'code-action'
    | 'custom-commands'
    | 'test'
    | 'code-lens'
    | CodyDefaultCommands
    | RecipeID
