import type { ChatMessage, SerializedChatMessage } from './messages'

/**
 * The serialized form of a chat transcript (all data needed to display and recreate a chat
 * session).
 */
export interface SerializedChatTranscript {
    /** A unique and opaque identifier for this transcript. */
    id: string

    /**
     * The chat model used for the chat session.
     *
     * @deprecated The chat model is now a per-message property instead of applying to the entire
     * chat session, to allow users to change the model partway through the chat. Use the last
     * {@link SerializedChatMessage.model} instead. Can remove in v1.22 (after 1 major release,
     * v1.20, where both fields are written).
     */
    chatModel?: string

    chatTitle?: string
    interactions: SerializedChatInteraction[]
    lastInteractionTimestamp: string
    enhancedContext?: {
        /**
         * For enterprise multi-repo search, the manually selected repository names (for example
         * "github.com/sourcegraph/sourcegraph") and IDs.
         */
        selectedRepos: { id: string; name: string }[]
    }
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
        ...chatMessage,
        text: chatMessage.text ? chatMessage.text.toString() : undefined,
    }
}
