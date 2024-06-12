import * as vscode from 'vscode'
import type { FixupTask } from '../FixupTask'
import { getLastFullLine } from './utils'

const UNICODE_SPACE = '\u00a0'

export interface Decorations {
    linesAdded: vscode.DecorationOptions[]
    linesRemoved: vscode.DecorationOptions[]
    unvisitedLines: vscode.DecorationOptions[]
    currentLine?: vscode.DecorationOptions
}

export interface ComputedOutput {
    decorations: Decorations
}

export function computeFinalDecorations(task: FixupTask): ComputedOutput | null {
    if (!task.diff) {
        return null
    }

    const decorations: Decorations = {
        linesAdded: [],
        linesRemoved: [],
        unvisitedLines: [],
    }

    for (const edit of task.diff) {
        if (edit.type === 'deletion') {
            const padding = (edit.oldText.match(/^\s*/)?.[0] || '').length // Get leading whitespace for line
            decorations.linesRemoved.push({
                range: edit.range,
                renderOptions: {
                    after: { contentText: UNICODE_SPACE.repeat(padding) + edit.oldText.trim() },
                },
            })
        } else if (edit.type === 'insertion') {
            decorations.linesAdded.push({ range: edit.range })
        }
    }

    return { decorations }
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
): ComputedOutput | null {
    if (task.replacement || !task.inProgressReplacement) {
        return null
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

    // Given the in-progress replacement,
    const latestFullLine = getLastFullLine(task.inProgressReplacement)
    if (!latestFullLine) {
        return { decorations }
    }

    const nextLineIndex = currentLineIndex + 1
    const linesToSeek = task.original.split('\n').slice(nextLineIndex)
    const foundLine = linesToSeek.findIndex(line => line.trim() === latestFullLine.trim())

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

    return { decorations }
}
