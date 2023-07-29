import type { InlineCompletionItem as VSCodeInlineCompletionItem } from 'vscode'

/**
 * @see vscode.InlineCompletionItem
 */
export type InlineCompletionItem = Omit<InstanceType<typeof VSCodeInlineCompletionItem>, 'insertText'> & {
    insertText: string
}
