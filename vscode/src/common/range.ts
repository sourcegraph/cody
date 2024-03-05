import type { RangeData } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

export function toVSCodeRange(range?: RangeData): vscode.Range | undefined {
    if (!range) {
        return undefined
    }

    // HACK: If value was accidentally serialized as [start, end] (which `vscode.Range` instances do
    // when JSON-serialized), handle it.
    if (Array.isArray(range)) {
        return new vscode.Range(range[0].line, range[0].character, range[1].line, range[1].character)
    }

    return new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character)
}
