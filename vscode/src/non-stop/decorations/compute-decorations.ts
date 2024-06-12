import { diffLines } from 'diff'
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

export type PlaceholderLines = number[]

export interface ComputedOutput {
    decorations: Decorations
    placeholderLines?: PlaceholderLines
    diff?: Edit[]
}

export interface Edit {
    text: string
    range: vscode.Range
}

export function computeFinalDecorations(
    task: FixupTask,
    document?: vscode.TextDocument
): ComputedOutput | null {
    if (!task.replacement) {
        return null
    }

    let startLine = task.selectionRange.start.line
    const replacementDiff: Edit[] = []
    const placeholderLines: PlaceholderLines = []
    const decorations: Decorations = {
        linesAdded: [],
        linesRemoved: [],
        unvisitedLines: [],
    }

    const diff = diffLines(task.original, task.replacement)
    for (const change of diff) {
        const count = change.count || 0
        const lines = change.value.split('\n')

        if (change.removed) {
            for (let i = 0; i < count; i++) {
                const line = lines[i]
                const padding = (line.match(/^\s*/)?.[0] || '').length // Get leading whitespace for line
                const insertionLine = new vscode.Position(startLine, 0)
                decorations.linesRemoved.push({
                    range: new vscode.Range(insertionLine, insertionLine),
                    renderOptions: {
                        after: { contentText: UNICODE_SPACE.repeat(padding) + line.trim() },
                    },
                })
                placeholderLines.push(startLine)
                if (document) {
                    const lineToReplace = document.lineAt(startLine)
                    replacementDiff.push({
                        text: '\n',
                        range: lineToReplace.rangeIncludingLineBreak,
                    })
                }
                startLine++
            }
        } else if (change.added) {
            for (let i = 0; i < count; i++) {
                const insertionLine = new vscode.Position(startLine, 0)
                decorations.linesAdded.push({
                    range: new vscode.Range(insertionLine, insertionLine),
                })
                replacementDiff.push({
                    text: lines[i],
                    range: new vscode.Range(insertionLine, insertionLine),
                })
                startLine++
            }
        } else {
            startLine += count
        }
    }

    console.log('Got replacement', replacementDiff)
    return { decorations, placeholderLines }
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
