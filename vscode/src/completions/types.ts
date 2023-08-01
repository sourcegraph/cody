import type { InlineCompletionItem as VSCodeInlineCompletionItem } from 'vscode'
import { Range } from 'vscode-languageserver-textdocument'

export interface Completion {
    content: string
    stopReason?: string
}

/**
 * @see vscode.InlineCompletionItem
 */
export type InlineCompletionItem = Omit<InstanceType<typeof VSCodeInlineCompletionItem>, 'insertText' | 'range'> & {
    insertText: string
    range?: Range
}
