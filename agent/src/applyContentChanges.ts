import { applyPatch } from 'fast-myers-diff'
import * as vscode from 'vscode'
import type { AgentTextDocument } from './AgentTextDocument'
import type { ProtocolTextDocumentContentChangeEvent } from './protocol-alias'

export function applyContentChanges(
    document: AgentTextDocument,
    changes: ProtocolTextDocumentContentChangeEvent[]
): { newText: string; contentChanges: vscode.TextDocumentContentChangeEvent[] } {
    const patch: [number, number, string][] = []
    const contentChanges: vscode.TextDocumentContentChangeEvent[] = []

    for (const change of changes) {
        const start = document.offsetAt(change.range.start)
        const end = document.offsetAt(change.range.end)
        patch.push([start, end, change.text])
        contentChanges.push({
            range: new vscode.Range(
                change.range.start.line,
                change.range.start.character,
                change.range.end.line,
                change.range.end.character
            ),
            rangeLength: end - start,
            rangeOffset: start,
            text: change.text,
        })
    }

    const newText: string[] = []
    for (const part of applyPatch<string, string>(document.content, patch)) {
        newText.push(part)
    }
    return { newText: newText.join(''), contentChanges }
}
