import * as diff from 'fast-myers-diff'
import { Range, TextDocument, TextDocumentContentChangeEvent } from 'vscode'

export function diffDocuments(
    oldDocument: Pick<TextDocument, 'getText' | 'positionAt'>,
    newDocument: Pick<TextDocument, 'getText'>
): TextDocumentContentChangeEvent[] {
    const contentChanges: TextDocumentContentChangeEvent[] = []
    const edits = diff.calcPatch(oldDocument.getText() ?? '', newDocument.getText() ?? '')
    for (const [sx, ex, text] of edits) {
        contentChanges.push({
            range: new Range(oldDocument.positionAt(sx), oldDocument.positionAt(ex)),
            rangeOffset: sx,
            rangeLength: ex - sx,
            text,
        })
    }
    return contentChanges
}
