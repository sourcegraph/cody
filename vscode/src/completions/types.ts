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
    range?: Range
}

/**
 * Keep property names in sync with the `EmbeddingsSearchResult` type.
 */
export interface ContextSnippet {
    fileName: string
    content: string
}
