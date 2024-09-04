export type PersistenceEventMetadata = { [key: string]: unknown }

export interface PersistencePresentEventPayload<T = string> {
    /** An ID to uniquely identify an accepted insertion. */
    id: T
    /** How many seconds after the acceptance was the check performed */
    afterSec: number
    /** Levenshtein distance between the current document state and the accepted completion */
    difference: number
    /** Number of lines still in the document */
    lineCount: number
    /** Number of characters still in the document */
    charCount: number
    /** Attached metadata to the insertion */
    metadata?: PersistenceEventMetadata
    /** The diff between the current document state and the accepted completion */
    // 🚨 SECURITY: We diff calculated here should only be logged for dotCom users with public repos.
    diff?: string
}

export interface PersistenceRemovedEventPayload<T = string> {
    /** An ID to uniquely identify an accepted insertion. */
    id: T
    /** Levenshtein distance between the current document state and the accepted completion */
    difference: 1
    /** Attached metadata to the insertion */
    metadata?: PersistenceEventMetadata
}
