import { type LinesOptions, diffLines } from 'diff'
import * as vscode from 'vscode'

interface InsertionEdit {
    type: 'insertion'
    text: string
    range: vscode.Range
}

interface DeletionEdit {
    type: 'deletion'
    range: vscode.Range
}

interface DecoratedReplacementEdit {
    type: 'decoratedReplacement'
    text: string
    oldText: string
    range: vscode.Range
}

export type Edit = InsertionEdit | DeletionEdit | DecoratedReplacementEdit

interface ComputedDiffOptions {
    decorateDeletions: boolean
}

export function computeDiff(
    replacement: string,
    original: string,
    range: vscode.Range,
    options: ComputedDiffOptions
): Edit[] | undefined {
    if (!replacement) {
        return
    }

    let startLine = range.start.line
    const applicableDiff: Edit[] = []
    const diff = diffLines(
        original,
        replacement,
        {
            // Handle cases where we generate an incorrect diff due to a mismatch in the end of line sequence between
            // the LLM and the original code in the users' editor.
            stripTrailingCr: true,
        } as LinesOptions // @types/diff is not currently up to date
    )

    for (const change of diff) {
        const count = change.count || 0

        if (change.removed) {
            if (options.decorateDeletions) {
                // Clamp old text to match `count`, as `count` does not include trailing new lines here.
                // We will inject this text as a decoration later
                const oldText = change.value.split('\n').slice(0, count).join('\n')
                applicableDiff.push({
                    type: 'decoratedReplacement',
                    text: '\n'.repeat(count),
                    oldText,
                    range: new vscode.Range(startLine, 0, startLine + count, 0),
                })
                // We must increment as we haven't technically deleted the line, only replaced
                // it with whitespace
                startLine += count
            } else {
                applicableDiff.push({
                    type: 'deletion',
                    range: new vscode.Range(startLine, 0, startLine + count, 0),
                })
            }
        } else if (change.added) {
            applicableDiff.push({
                type: 'insertion',
                text: change.value,
                range: new vscode.Range(startLine, 0, startLine + count, 0),
            })
            startLine += count
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

        // Note: We do not modify `linesAdded` if we have a `decoratedDeletion`
        // This is because there is no net change in lines from this, we have just replaced
        // that line with an empty string
        const linesChanged = edit.range.end.line - edit.range.start.line
        if (edit.type === 'insertion') {
            linesAdded += linesChanged
        } else if (edit.type === 'deletion') {
            linesAdded -= linesChanged
        }
    }

    return suitableEdit
}
