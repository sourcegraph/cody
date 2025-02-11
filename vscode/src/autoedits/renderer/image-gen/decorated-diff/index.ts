import type * as vscode from 'vscode'
import type { DecorationInfo } from '../../decorators/base'
import { blockify } from '../../decorators/blockify-new'
import { syntaxHighlightDecorations } from '../highlight/highlight-decorations'
import type { VisualDiff, VisualDiffAdditions, VisualDiffLine } from './types'

export function makeDecoratedDiff(
    decorationInfo: DecorationInfo,
    lang: string,
    mode: 'additions' | 'unified',
    document: vscode.TextDocument
): { dark: VisualDiff; light: VisualDiff } {
    const visualDiff = makeVisualDiff(decorationInfo, mode)
    const blockifiedDiff = blockify(visualDiff, mode, document)
    return {
        dark: syntaxHighlightDecorations(blockifiedDiff, lang, 'dark'),
        light: syntaxHighlightDecorations(blockifiedDiff, lang, 'light'),
    }
}

/**
 * Given a decoration info, this function will return a diff that is suitable for rendering.
 * It also supports transforming the diff into a unified diff.
 */
export function makeVisualDiff(
    decorationInfo: DecorationInfo,
    mode: 'additions' | 'unified'
): VisualDiff {
    const sortedDiff = [
        ...decorationInfo.addedLines,
        ...decorationInfo.modifiedLines,
        ...decorationInfo.unchangedLines,
        ...decorationInfo.removedLines,
    ].sort((a, b) => {
        const aLine = a.type === 'removed' ? a.originalLineNumber : a.modifiedLineNumber
        const bLine = b.type === 'removed' ? b.originalLineNumber : b.modifiedLineNumber
        return aLine - bLine
    })

    // We do not care about unchanged lines above or below the first relevant lines
    const firstRelevantLine = sortedDiff.findIndex(line => line.type !== 'unchanged')
    const lastRelevantLine = sortedDiff.findLastIndex(line => line.type !== 'unchanged')
    const relevantDiff = sortedDiff.slice(firstRelevantLine, lastRelevantLine + 1)

    if (mode === 'additions') {
        // We only care about existing and new lines here.
        const lines = relevantDiff.filter(line =>
            ['added', 'modified', 'unchanged'].includes(line.type)
        ) as VisualDiffAdditions[]
        return { type: mode, lines: lines }
    }

    // We need to transform the diff into a unified diff
    // This will involve splitting modified lines into two lines and grouping additions and deletions together
    const lines: VisualDiffLine[] = []
    const deletions: VisualDiffLine[] = []
    const additions: VisualDiffLine[] = []

    for (let i = 0; i < relevantDiff.length; i++) {
        const line = relevantDiff[i]

        if (line.type === 'modified') {
            // Split modified lines into two, ensuring the removed line is shown first
            deletions.push({
                type: 'modified-removed',
                text: line.oldText,
                highlights: line.oldHighlights,
                changes: line.changes,
                originalLineNumber: line.originalLineNumber,
                modifiedLineNumber: line.modifiedLineNumber,
            })
            additions.push({
                type: 'modified-added',
                text: line.newText,
                highlights: line.newHighlights,
                changes: line.changes,
                originalLineNumber: line.originalLineNumber,
                modifiedLineNumber: line.modifiedLineNumber,
            })
        } else if (line.type === 'removed') {
            deletions.push(line)
        } else if (line.type === 'added') {
            additions.push(line)
        } else {
            // We have hit an unchanged line, we can now flush any pending deletions/additions
            // in the desired order, and continue with the unchanged line
            if (deletions.length > 0 || additions.length > 0) {
                lines.push(...deletions, ...additions)
                // Clear the arrays
                deletions.length = 0
                additions.length = 0
            }
            lines.push(line)
        }
    }

    // End of the diff, ensure we have flushed any pending deletions/additions
    if (deletions.length > 0 || additions.length > 0) {
        lines.push(...deletions, ...additions)
    }

    return { type: mode, lines }
}
