import * as vscode from 'vscode'
import { isStreamedIntent } from '../../edit/utils/edit-intent'
import type { FixupTask } from '../FixupTask'
import { getDecorationSuitableText, getLastFullLine, getVisibleDocument } from './utils'

export interface Decorations {
    linesAdded: vscode.DecorationOptions[]
    linesRemoved: vscode.DecorationOptions[]
    unvisitedLines: vscode.DecorationOptions[]
    currentLine?: vscode.DecorationOptions
}

export interface ComputedOutput {
    decorations: Decorations
}

export function computeAppliedDecorations(task: FixupTask): Decorations | undefined {
    const visibleDocument = getVisibleDocument(task)
    if (!visibleDocument) {
        return
    }

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
        if (edit.type === 'decoratedDeletion') {
            // Decorations do not render tab characters, we must convert any tabs to spaces.
            const decorationText = getDecorationSuitableText(edit.oldText, visibleDocument)
            decorations.linesRemoved.push({
                range: edit.range,
                renderOptions: {
                    after: { contentText: decorationText },
                },
            })
        } else if (edit.type === 'insertion') {
            decorations.linesAdded.push({ range: edit.range })
        }
    }

    return decorations
}

function getRemainingLinesFromRange(range: vscode.Range, index: number) {
    const result: vscode.Range[] = []
    const totalLines = range.end.line - range.start.line
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
        getRemainingLinesFromRange(task.selectionRange, currentLineIndex + 1).map(range => ({ range }))
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

    const nextLineIndex = currentLineIndex + 1
    const linesToSeek = task.original.split('\n').slice(nextLineIndex)
    const foundLine = linesToSeek.findIndex(line => {
        const trimmedLine = line.trim()
        if (trimmedLine.length < 3) {
            // Line is too short, may not be a match, skip it
        }
        return trimmedLine === latestFullLine.trim()
    })

    if (foundLine > -1) {
        // We found a matching line, highlight it
        const currentLine = new vscode.Position(
            task.selectionRange.start.line + foundLine + nextLineIndex,
            0
        )
        decorations.currentLine = {
            range: new vscode.Range(currentLine, currentLine),
        }

        // We know that preceding lines are visited, but following lines are not, so highlight those too
        decorations.unvisitedLines = getRemainingLinesFromRange(
            task.selectionRange,
            foundLine + nextLineIndex + 1
        ).map(range => ({
            range,
        }))
    }

    return decorations
}
