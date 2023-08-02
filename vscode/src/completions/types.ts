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
