import { diffLines } from 'diff'
import * as vscode from 'vscode'
import type { FixupTask } from './FixupTask'

interface InsertionEdit {
    type: 'insertion'
    text: string
    range: vscode.Range
}

interface DeletionEdit {
    type: 'deletion'
    text: string
    oldText: string
    range: vscode.Range
}

export type Edit = InsertionEdit | DeletionEdit

export function computeDiff2(task: FixupTask): Edit[] | undefined {
    if (!task.replacement) {
        return
    }

    let startLine = task.selectionRange.start.line
    const applicableDiff: Edit[] = []
    const diff = diffLines(task.original, task.replacement)

    for (const change of diff) {
        const count = change.count || 0
        const lines = change.value.split('\n')

        if (change.removed) {
            for (let i = 0; i < count; i++) {
                const line = lines[i]
                const range = new vscode.Range(startLine, 0, startLine, line.length)
                applicableDiff.push({
                    type: 'deletion',
                    text: '',
                    oldText: line,
                    range,
                })
                startLine++
            }
        } else if (change.added) {
            for (let i = 0; i < count; i++) {
                const range = new vscode.Range(startLine, 0, startLine, 0)
                applicableDiff.push({
                    type: 'insertion',
                    text: lines[i] + '\n',
                    range,
                })
                startLine++
            }
        } else {
            startLine += count
        }
    }

    return applicableDiff
}
