import { diffLines } from 'diff'
import * as vscode from 'vscode'
import { UNICODE_SPACE } from '../commands/GhostHintDecorator'

export const addedDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
    isWholeLine: true,
})

export const removedDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('diffEditor.removedLineBackground'),
    isWholeLine: true,
})

interface Decorations {
    added: vscode.DecorationOptions[]
    removed: vscode.DecorationOptions[]
}

export function computeDiffDecorations(
    original: string,
    incoming: string,
    lineIndex: number
): { decorations: Decorations; placeholderLines: vscode.Position[] } {
    let startLine = lineIndex
    const placeholderLines: vscode.Position[] = []
    const decorations: Decorations = {
        added: [],
        removed: [],
    }

    const diff = diffLines(original, incoming)
    for (const change of diff) {
        const lines = change.value.split('\n').filter(Boolean)
        if (change.removed) {
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i]
                // Get leading whitespace for line
                const padding = (line.match(/^\s*/)?.[0] || '').length
                const insertionLine = new vscode.Position(startLine, 0)
                decorations.removed.push({
                    range: new vscode.Range(insertionLine, insertionLine),
                    renderOptions: {
                        after: { contentText: UNICODE_SPACE.repeat(padding) + line.trim() },
                    },
                })
                placeholderLines.push(insertionLine)
                startLine++
            }
        } else if (change.added) {
            for (let i = 0; i < lines.length; i++) {
                const insertionLine = new vscode.Position(startLine, 0)
                decorations.added.push({
                    range: new vscode.Range(insertionLine, insertionLine),
                })
                startLine++
            }
        } else {
            // unchanged line
            startLine += lines.length
        }
    }

    return { decorations, placeholderLines }
}
