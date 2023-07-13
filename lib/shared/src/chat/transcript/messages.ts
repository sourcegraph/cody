import { ContextFile } from '../../codebase-context/messages'
import { IPluginContext } from '../../plugins/api/types'
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
    pluginsContext?: IPluginContext[]
    buttons?: ChatButton[]
}

export interface InteractionMessage extends Message {
    displayText?: string
    prefix?: string
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
