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
interface FileContextSnippet {
    fileName: string
    content: string
}
export interface SymbolContextSnippet {
    fileName: string
    symbol: string
    content: string
    sourceSymbolAndRelationship?: {
        symbol: string
        relationship: 'typeDefinition' | 'implementation'
    }
}
export type ContextSnippet = FileContextSnippet | SymbolContextSnippet
