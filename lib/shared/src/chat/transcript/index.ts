import type { ChatMessage } from './messages'

/**
 * The serialized form of a chat transcript (all data needed to display and recreate a chat
 * session).
 */
export interface SerializedChatTranscript {
    /** A unique and opaque identifier for this transcript. */
    id: string

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
    humanMessage: ChatMessage

    /** `null` if the assistant has not yet replied to the human message. */
    assistantMessage: ChatMessage | null
}
