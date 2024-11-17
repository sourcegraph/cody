import type * as vscode from 'vscode'

export function applyTextDocumentChanges(
    content: string,
    changes: vscode.TextDocumentContentChangeEvent[]
): string {
    for (const change of changes) {
        content =
            content.slice(0, change.rangeOffset) +
            change.text +
            content.slice(change.rangeOffset + change.rangeLength)
    }
    return content
}
