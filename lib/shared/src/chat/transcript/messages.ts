import type { ContextItem } from '../../codebase-context/messages'
import type { Message } from '../../sourcegraph-api'

import type { SerializedChatTranscript } from '.'

export interface ChatMessage extends Message {
    contextFiles?: ContextItem[]
    error?: ChatError

    /**
     * For messages composed in a rich text editor field, this is the representation of the editor
     * state that can be used to instantiate the editor to edit the message or to render the
     * message. This field's value is opaque to all but the rich editor, and it must validate and
     * version the value so that it can (1) support backward- and forward-compatibility and (2) fall
     * back to editing the text for invalid values.
     */
    editorState?: unknown
}

export interface ChatError {
    kind?: string
    name: string
    message: string

    // Rate-limit properties
    retryAfter?: string | null
    limit?: number
    userMessage?: string
    retryAfterDate?: Date
    retryAfterDateString?: string // same as retry after Date but JSON serializable
    retryMessage?: string
    feature?: string
    upgradeIsAvailable?: boolean

    // Prevent Error from being passed as ChatError.
    // Errors should be converted using errorToChatError.
    isChatErrorGuard: 'isChatErrorGuard'
}

export interface UserLocalHistory {
    chat: ChatHistory
}

export interface ChatHistory {
    [chatID: string]: SerializedChatTranscript
}

/**
 * We need to specific a default event source as some commands can be
 * executed directly through VS Code where we cannot provide a custom source.
 * For example: Commands executed through the command palette, right-click menu or through keyboard shortcuts.
 */
export const DEFAULT_EVENT_SOURCE = 'editor'

export type EventSource =
    | typeof DEFAULT_EVENT_SOURCE
    | 'chat'
    | 'menu' // Cody command palette
    | 'sidebar'
    | 'code-action:explain'
    | 'code-action:document'
    | 'code-action:edit'
    | 'code-action:fix'
    | 'code-action:generate'
    | 'code-action:test'
    | 'custom-commands'
    | 'code-lens'
    | 'hover'
    | 'terminal'

/**
 * Converts an Error to a ChatError. Note that this cannot be done naively,
 * because some of the Error object's keys are typically not enumerable, and so
 * would be omitted during serialization.
 */
export function errorToChatError(error: Error): ChatError {
    return {
        isChatErrorGuard: 'isChatErrorGuard',
        ...error,
        message: error.message,
        name: error.name,
    }
}
