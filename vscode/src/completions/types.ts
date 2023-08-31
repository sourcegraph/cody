import { Range } from 'vscode-languageserver-textdocument'

export interface Completion {
    content: string
    stopReason?: string
}

/**
 * @see vscode.InlineCompletionItem
 */
export interface InlineCompletionItem {
    insertText: string
    /**
     * The range to replace.
     * Must begin and end on the same line.
     *
     * Prefer replacements over insertions to provide a better experience when the user deletes typed text.
     */
    range?: Range
}

/**
 * Keep property names in sync with the `EmbeddingsSearchResult` type.
 */
export interface ContextSnippet {
    fileName: string
    content: string
}
