import type { UIDiffLine, UIFileDiff } from '@sourcegraph/cody-shared'
import * as Diff from 'diff'
import type { URI } from 'vscode-uri'

/**
 * Generate a markdown git diff with line numbers, showing only the section with changes
 */
export function diffWithLineNum(oldText: string, newText: string, markdownFormat = true): string {
    const diff = Diff.diffLines(oldText, newText)
    let output = markdownFormat ? '```diff\n' : ''

    // First pass: find the first and last changed lines
    let firstChangedOldLine = Number.POSITIVE_INFINITY
    let lastChangedOldLine = 0
    let firstChangedNewLine = Number.POSITIVE_INFINITY
    let lastChangedNewLine = 0

    let oldLineCounter = 1
    let newLineCounter = 1

    // First pass to find boundaries, and collect change metadata
    const changeData: {
        start: number
        end: number
        text: string
        added?: boolean
        removed?: boolean
    }[] = []

    for (const part of diff) {
        const lines = part.value.split('\n')
        // Remove empty line that comes from split when there's a newline at the end
        if (lines[lines.length - 1] === '') {
            lines.pop()
        }
        const lineCount = lines.length

        if (part.added) {
            firstChangedNewLine = Math.min(firstChangedNewLine, newLineCounter)
            lastChangedNewLine = Math.max(lastChangedNewLine, newLineCounter + lineCount - 1)
            changeData.push({
                start: newLineCounter,
                end: newLineCounter + lineCount - 1,
                text: part.value,
                added: true,
            })
            newLineCounter += lineCount
        } else if (part.removed) {
            firstChangedOldLine = Math.min(firstChangedOldLine, oldLineCounter)
            lastChangedOldLine = Math.max(lastChangedOldLine, oldLineCounter + lineCount - 1)
            changeData.push({
                start: oldLineCounter,
                end: oldLineCounter + lineCount - 1,
                text: part.value,
                removed: true,
            })
            oldLineCounter += lineCount
        } else {
            // Store unchanged sections too
            changeData.push({
                start: oldLineCounter,
                end: oldLineCounter + lineCount - 1,
                text: part.value,
            })
            oldLineCounter += lineCount
            newLineCounter += lineCount
        }
    }

    // If no changes were found, return empty diff
    if (
        firstChangedOldLine === Number.POSITIVE_INFINITY &&
        firstChangedNewLine === Number.POSITIVE_INFINITY
    ) {
        return '```diff\n// No changes detected\n```'
    }

    // Add context lines around changes (3 lines before and after)
    const CONTEXT_LINES = 3
    const firstLineToShow = Math.max(
        1,
        Math.min(firstChangedOldLine, firstChangedNewLine) - CONTEXT_LINES
    )
    const lastLineToShow = Math.max(lastChangedOldLine, lastChangedNewLine) + CONTEXT_LINES

    // Maximum length for line numbers (for padding)
    const maxLineLength = Math.max(lastLineToShow.toString().length, lastLineToShow.toString().length)

    // Second pass: output only the relevant lines with proper context
    oldLineCounter = 1
    newLineCounter = 1

    for (const part of diff) {
        const lines = part.value.split('\n')
        if (lines[lines.length - 1] === '') {
            lines.pop()
        }

        for (const line of lines) {
            const shouldShowOldLine =
                oldLineCounter >= firstLineToShow && oldLineCounter <= lastLineToShow
            const shouldShowNewLine =
                newLineCounter >= firstLineToShow && newLineCounter <= lastLineToShow

            if (part.removed && shouldShowOldLine) {
                const paddedLineNumber = oldLineCounter.toString().padStart(maxLineLength, ' ')
                output += `${paddedLineNumber} - ${line}\n`
            } else if (part.added && shouldShowNewLine) {
                const paddedLineNumber = newLineCounter.toString().padStart(maxLineLength, ' ')
                output += `${paddedLineNumber} + ${line}\n`
            } else if (!part.added && !part.removed && (shouldShowOldLine || shouldShowNewLine)) {
                // Format unchanged lines
                const lineNumber = shouldShowOldLine ? oldLineCounter : newLineCounter
                const paddedLineNumber = lineNumber.toString().padStart(maxLineLength, ' ')
                output += `${paddedLineNumber}   ${line}\n`
            }

            if (part.removed) oldLineCounter++
            else if (part.added) newLineCounter++
            else {
                oldLineCounter++
                newLineCounter++
            }
        }
    }

    output += markdownFormat ? '```' : ''

    return output
}

export function getFileDiff(uri: URI, oldText: string, newText: string): UIFileDiff {
    const diff = Diff.diffLines(oldText, newText)
    const changes: UIDiffLine[] = []
    const total = {
        added: 0,
        removed: 0,
        modified: 0,
    }

    let oldLineCounter = 1
    let newLineCounter = 1

    // Add hunk header for context
    changes.push({
        type: 'unchanged',
        content: `@@ -1,${oldText.split('\n').length} +1,${newText.split('\n').length} @@`,
        lineNumber: Math.min(oldLineCounter, newLineCounter),
    })

    for (const part of diff) {
        const lines = part.value.split('\n')
        // Remove empty line that comes from split when there's a newline at the end
        if (lines[lines.length - 1] === '') {
            lines.pop()
        }

        for (const line of lines) {
            if (part.added) {
                changes.push({
                    type: 'added',
                    content: line,
                    lineNumber: newLineCounter,
                })
                newLineCounter++
                total.added++
            } else if (part.removed) {
                changes.push({
                    type: 'removed',
                    content: line,
                    lineNumber: oldLineCounter,
                })
                oldLineCounter++
                total.removed++
            } else {
                changes.push({
                    type: 'unchanged',
                    content: line,
                    lineNumber: oldLineCounter, // Using old line number for unchanged lines
                })
                oldLineCounter++
                newLineCounter++
            }
        }
    }

    // For modified lines, count the minimum of added and removed
    total.modified = Math.min(total.added, total.removed)
    total.added -= total.modified
    total.removed -= total.modified

    return {
        uri,
        total,
        changes,
    }
}
