import { ContextFile, PreciseContext } from '../../codebase-context/messages'
import { Message } from '../../sourcegraph-api'
import { CodyDefaultCommands } from '../prompts'
import { RecipeID } from '../recipes/recipe'

import { TranscriptJSON } from '.'

export interface ChatButton {
    label: string
    action: string
    onClick: (action: string) => void
    appearance?: 'primary' | 'secondary' | 'icon'
}

export interface ChatMessage extends Message {
    kind?: string
    className?: string
    displayText?: string
    contextFiles?: ContextFile[]
    preciseContext?: PreciseContext[]
    buttons?: ChatButton[]
    footerText?: string
    data?: any
    metadata?: ChatMetadata
    // TODO(dantup): Is anyone using string?
    error?: string | ChatError
}

export interface InteractionMessage extends ChatMessage {
    prefix?: string
}

export interface ChatError {
    kind?: string
    name: string
    message: string
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
