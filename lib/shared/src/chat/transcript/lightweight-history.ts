import type { SerializedChatTranscript } from '.'

/**
 * A lightweight version of SerializedChatTranscript containing only the essential
 * data needed for displaying in the history list.
 */
export interface LightweightChatTranscript {
    /** A unique and opaque identifier for this transcript. */
    id: string

    /** The title of the chat */
    chatTitle?: string

    /** Timestamp of the last interaction */
    lastInteractionTimestamp: string

    /** The first human message text (used as fallback title) */
    firstHumanMessageText?: string
}

/**
 * A lightweight version of UserLocalHistory containing only the essential
 * data needed for displaying in the history list.
 */
export interface LightweightChatHistory {
    [chatID: string]: LightweightChatTranscript
}

/**
 * Converts a SerializedChatTranscript to a LightweightChatTranscript
 */
export function toLightweightChatTranscript(
    transcript: SerializedChatTranscript
): LightweightChatTranscript {
    // Extract the first human message text to use as a fallback title
    const firstHumanMessage = transcript.interactions.find(
        i => !!transcript.chatTitle || !!i.humanMessage?.editorState
    )?.humanMessage

    return {
        id: transcript.id,
        chatTitle: transcript.chatTitle || firstHumanMessage?.text,
        lastInteractionTimestamp: transcript.lastInteractionTimestamp,
        firstHumanMessageText: firstHumanMessage?.text,
    }
}
