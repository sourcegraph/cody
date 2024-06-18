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
    range: vscode.Range
}

interface DecoratedDeletionEdit {
    type: 'decoratedDeletion'
    text: string
    oldText: string
    range: vscode.Range
}

export type Edit = InsertionEdit | DeletionEdit | DecoratedDeletionEdit

interface ComputedDiffOptions {
    decorateDeletions: boolean
}

export function computeDiff(
    task: FixupTask,
    document: vscode.TextDocument,
    options: ComputedDiffOptions
): Edit[] | undefined {
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
                const line = document.lineAt(startLine)
                if (options.decorateDeletions) {
                    // Store the previous line, we will inject it as a decoration
                    applicableDiff.push({
                        type: 'decoratedDeletion',
                        text: '',
                        oldText: line.text,
                        range: line.range,
                    })
                    // We must increment as we haven't technically deleted the line, only replaced
                    // it with whitespace
                    startLine++
                } else {
                    applicableDiff.push({
                        type: 'deletion',
                        // Deletion range should include the line break
                        range: line.rangeIncludingLineBreak,
                    })
                }
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

/**
 * The VS Code `editBuilder` does not expect to be provided with optimistic ranges.
 * For example, a second insertion should not assume (in it's range) that the first insertion was successful.
 * Subsequent insertions must use a range that assumes no other insertions were made.
 */
export function makeDiffEditBuilderCompatible(diff: Edit[]): Edit[] {
    let linesAdded = 0
    const suitableEdit = []

    for (const edit of diff) {
        suitableEdit.push({
            ...edit,
            range: new vscode.Range(
                edit.range.start.line - linesAdded,
                edit.range.start.character,
                edit.range.end.line - linesAdded,
                edit.range.end.character
            ),
        })

        // Note: We do not modify `linesChanged` if we have a `decoratedDeletion`
        // This is because there is no net change in lines from this, we have just replaced
        // that line with an empty string
        if (edit.type === 'insertion') {
            linesAdded++
        } else if (edit.type === 'deletion') {
            linesAdded--
        }
    }

    return suitableEdit
}
