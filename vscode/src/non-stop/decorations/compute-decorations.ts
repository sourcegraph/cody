import * as vscode from 'vscode'
import { isStreamedIntent } from '../../edit/utils/edit-intent'
import type { FixupTask } from '../FixupTask'
import { getDecorationSuitableText, getLastFullLine } from './utils'

export interface Decorations {
    linesAdded: vscode.DecorationOptions[]
    linesRemoved: vscode.DecorationOptions[]
    unvisitedLines: vscode.DecorationOptions[]
    currentLine?: vscode.DecorationOptions
}

export function computeAppliedDecorations(task: FixupTask): Decorations | undefined {
    const decorations: Decorations = {
        linesAdded: [],
        linesRemoved: [],
        unvisitedLines: [],
    }

    if (task.intent === 'doc') {
        // Decorations are disabled for the `doc` intent.
        // This is because the `task.selectionRange` does not match the LLM output, as we trim it
        // to only produce a docstring, and not and replacement code.
        // We should refactor and not assume `task.selectionRange` is identical for LLM context and task output.
        // Issue: https://github.com/sourcegraph/cody/issues/4628
        return
    }

    if (task.mode === 'insert') {
        // We don't calculate a diff for insertions, instead we just need
        // to decorate all inserted lines.
        const replacement = task.inProgressReplacement || task.replacement || ''
        const replacementLines = replacement.split('\n')
        const totalLines = replacementLines.length
        for (let i = 0; i < totalLines; i++) {
            const line = new vscode.Position(task.insertionPoint.line + i, 0)
            decorations.linesAdded.push({ range: new vscode.Range(line, line) })
        }
        return decorations
    }

    if (!task.diff) {
        return
    }

    for (const edit of task.diff) {
        const countChanged = edit.range.end.line - edit.range.start.line - 1
        if (edit.type === 'decoratedReplacement') {
            const linesDeleted = edit.oldText.split('\n')
            for (let i = 0; i <= countChanged; i++) {
                const decorationText = getDecorationSuitableText(linesDeleted[i], task.document)
                const line = new vscode.Position(edit.range.start.line + i, 0)
                decorations.linesRemoved.push({
                    range: new vscode.Range(line, line),
                    renderOptions: {
                        after: { contentText: decorationText },
                    },
                    // Add a `hoverMessage` so users' can still select and copy the deleted
                    // text as `contentText` is not selectable.
                    hoverMessage: edit.oldText,
                })
            }
        } else if (edit.type === 'insertion') {
            decorations.linesAdded.push({
                range: new vscode.Range(
                    edit.range.start.line,
                    0,
                    edit.range.start.line + countChanged,
                    0
                ),
            })
        }
    }

    return decorations
}

/**
 * Given a VS Code range, trims empty lines from the start and end of the range.
 * These ranges are useful for diffing, but not for decorating as we will always
 * decorate an entire line.
 */
function trimEmptyLinesFromRange(range: vscode.Range, document: vscode.TextDocument): vscode.Range {
    let startLineIndex = range.start.line
    let endLineIndex = range.end.line

    const startLine = document.lineAt(startLineIndex)
    if (range.start.character === startLine.range.end.character || startLine.text.length === 0) {
        startLineIndex++
    }

    const endLine = document.lineAt(startLineIndex)
    if (range.end.character === 0 || endLine.text.length === 0) {
        endLineIndex--
    }

    return new vscode.Range(
        new vscode.Position(startLineIndex, 0),
        new vscode.Position(endLineIndex, document.lineAt(endLineIndex).text.length)
    )
}

function getRemainingLinesFromRange(range: vscode.Range, index: number, document: vscode.TextDocument) {
    const trimmedRange = trimEmptyLinesFromRange(range, document)
    const result: vscode.Range[] = []
    const totalLines = trimmedRange.end.line - trimmedRange.start.line
    for (let i = index; i <= totalLines; i++) {
        const line = new vscode.Position(range.start.line + i, 0)
        result.push(new vscode.Range(line, line))
    }
    return result
}

export function computeOngoingDecorations(
    task: FixupTask,
    prevComputed?: Decorations
): Decorations | undefined {
    if (task.intent === 'doc') {
        // Decorations are disabled for the `doc` intent.
        // This is because the `task.selectionRange` does not match the LLM output, as we trim it
        // to only produce a docstring, and not and replacement code.
        // We should refactor and not assume `task.selectionRange` is identical for LLM context and task output.
        // Issue: https://github.com/sourcegraph/cody/issues/4628
        return
    }

    if (isStreamedIntent(task.intent)) {
        // We don't provide ongoing decorations for streamed edits, only applied decorations
        // as the incoming changes are immediately applied.
        return
    }

    const currentLine = prevComputed?.currentLine || {
        range: new vscode.Range(task.selectionRange.start.line, 0, task.selectionRange.start.line, 0),
    }
    const currentLineIndex = currentLine.range.start.line - task.selectionRange.start.line
    const unvisitedLines =
        prevComputed?.unvisitedLines ||
        getRemainingLinesFromRange(task.selectionRange, currentLineIndex + 1, task.document).map(
            range => ({ range })
        )
    const decorations: Decorations = {
        linesAdded: [],
        linesRemoved: [],
        unvisitedLines,
        currentLine,
    }

    const replacement = task.replacement || task.inProgressReplacement || ''
    const latestFullLine = getLastFullLine(replacement)
    if (!latestFullLine) {
        return decorations
    }

    const linesToSeek = task.original.split('\n').slice(currentLineIndex)
    const foundLine = linesToSeek.findIndex(line => {
        if (line.trim().length < 3) {
            // This line does not have enough useful characters to be considered a useful match.
            // 3 is used as it covers most common opening/closing bracket cases, e.g. "}", ")}", ")};"
            // It is also likely that the LLM will quickly move past this line, so skipping it has
            // a minimal effect.
            return false
        }
        return line === latestFullLine
    })

    if (foundLine > -1) {
        // We found a matching line, highlight it
        const currentLine = new vscode.Position(
            task.selectionRange.start.line + foundLine + currentLineIndex,
            0
        )
        decorations.currentLine = {
            range: new vscode.Range(currentLine, currentLine),
        }

        // We know that preceding lines are visited, but following lines are not, so highlight those too
        decorations.unvisitedLines = getRemainingLinesFromRange(
            task.selectionRange,
            foundLine + currentLineIndex + 1,
            task.document
        ).map(range => ({
            range,
        }))
    }

    return decorations
}
