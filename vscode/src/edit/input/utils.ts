import type * as vscode from 'vscode'
import { displayPath, type ContextFile } from '@sourcegraph/cody-shared'

export function removeAfterLastAt(str: string): string {
    const lastIndex = str.lastIndexOf('@')
    if (lastIndex === -1) {
        // Return the original string if "@" is not found
        return str
    }
    return str.slice(0, lastIndex)
}

export function getLabelForContextFile(file: ContextFile): string {
    const isFileType = file.type === 'file'
    const rangeLabel = file.range ? `:${file.range?.start.line}-${file.range?.end.line}` : ''
    if (isFileType) {
        return `${displayPath(file.uri)}${rangeLabel}`
    }
    return `${displayPath(file.uri)}${rangeLabel}#${file.symbolName}`
}

/**
 * Returns a string representation of the given range, formatted as "{startLine}:{endLine}".
 * If startLine and endLine are the same, returns just the line number.
 */
export function getTitleRange(range: vscode.Range): string {
    if (range.isEmpty) {
        // No selected range, return just active line
        return `${range.start.line + 1}`
    }

    const endLine = range.end.character === 0 ? range.end.line - 1 : range.end.line
    if (range.start.line === endLine) {
        // Range only encompasses a single line
        return `${range.start.line + 1}`
    }

    return `${range.start.line + 1}:${endLine + 1}`
}
