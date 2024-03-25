import type * as vscode from 'vscode'

export interface TrackedInsertion<T = string> {
    id: T
    uri: vscode.Uri
    // When a document is rename, the TextDocument instance will still work
    // however the URI it resolves to will be outdated. Ensure we never use it.
    document: Omit<vscode.TextDocument, 'uri'>
    insertedAt: number
    insertText: string
    insertRange: vscode.Range
    latestRange: vscode.Range
}

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
}

export interface PersistenceRemovedEventPayload<T = string> {
    /** An ID to uniquely identify an accepted insertion. */
    id: T
}
