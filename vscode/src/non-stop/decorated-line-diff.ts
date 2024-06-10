import { diffLines } from 'diff'
import * as vscode from 'vscode'

export enum DiffOperation {
    LINE_INSERTED = 0,
    LINE_DELETED = 1,
    LINE_DECORATION_INSERTED = 2,
}

interface DeletedLine {
    type: DiffOperation.LINE_DELETED
    range: vscode.Range
}

interface InsertedLine {
    type: DiffOperation.LINE_INSERTED
    range: vscode.Range
    text: string
    decoration?: vscode.DecorationOptions
}

interface InsertedLineViaDecoration {
    type: DiffOperation.LINE_DECORATION_INSERTED
    range: vscode.Range
    text: string
    decoration?: vscode.DecorationOptions
}

type DecoratedLineDiff = DeletedLine | InsertedLine | InsertedLineViaDecoration

export function computeDecoratedLineDiff(
    original: string,
    replacement: string,
    index: number,
    document: vscode.TextDocument
): DecoratedLineDiff[] {
    let startLine = index
    const result: DecoratedLineDiff[] = []
    const diff = diffLines(original, replacement)

    for (const change of diff) {
        if (change.removed) {
            const removalRange = new vscode.Range(
                new vscode.Position(startLine, 0),
                new vscode.Position(startLine + change.count!, 0)
            )
            result.push(
                {
                    type: DiffOperation.LINE_DELETED,
                    range: removalRange,
                },
                {
                    type: DiffOperation.LINE_DECORATION_INSERTED,
                    range: removalRange,
                    text: document.getText(removalRange),
                }
            )
        } else if (change.added) {
            const endLine = startLine + change.count!
            result.push({
                type: DiffOperation.LINE_INSERTED,
                range: new vscode.Range(
                    new vscode.Position(startLine, 0),
                    new vscode.Position(endLine, 0)
                ),
                text: change.value,
            })
            startLine = endLine
        } else {
            // unchanged line
            startLine += change.count! - 1
        }
    }

    return result
}
