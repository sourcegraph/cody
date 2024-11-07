import type { ChatMessage, SerializedChatMessage } from './messages'

/**
 * The serialized form of a chat transcript (all data needed to display and recreate a chat
 * session).
 */
export interface SerializedChatTranscript {
    /** A unique and opaque identifier for this transcript. */
    id: string

    chatTitle?: string
    interactions: SerializedChatInteraction[]
    lastInteractionTimestamp: string
}

/**
 * The serialized form of a back-and-forth interaction in a chat transcript.
 */
export interface SerializedChatInteraction {
    humanMessage: SerializedChatMessage

    /** `null` if the assistant has not yet replied to the human message. */
    assistantMessage: SerializedChatMessage | null
}

export function serializeChatMessage(chatMessage: ChatMessage): SerializedChatMessage {
    return {
        speaker: chatMessage.speaker,
        model: chatMessage.model,
        contextFiles: chatMessage.contextFiles,
        editorState: chatMessage.editorState,
        error: chatMessage.error,
        text: chatMessage.text ? chatMessage.text.toString() : undefined,
        intent: chatMessage.intent,
    }
}
