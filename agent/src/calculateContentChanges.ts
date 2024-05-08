import { calcPatch } from 'fast-myers-diff'
import * as vscode from 'vscode'

export function* calculateContentChanges(
    document: vscode.TextDocument,
    newText: string
): Generator<vscode.TextDocumentContentChangeEvent> {
    const edits = calcPatch(document.getText(), newText)
    for (const [sx, ex, text] of edits) {
        yield {
            range: new vscode.Range(document.positionAt(sx), document.positionAt(ex)),
            rangeOffset: sx,
            rangeLength: ex - sx,
            text,
        }
    }
}
