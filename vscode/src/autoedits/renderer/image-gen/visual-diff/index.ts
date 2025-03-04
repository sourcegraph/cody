import type * as vscode from 'vscode'
import type { AutoeditDiff } from '../../decorators/base'
import { isOnlyAddingTextForModifiedLines } from '../../diff-utils'
import { getDiffTargetPosition } from '../utils'
import { blockify } from './blockify'
import type { DiffMode, VisualDiff, VisualDiffLine } from './types'

export function makeVisualDiff(
    decorationInfo: AutoeditDiff,
    mode: DiffMode,
    document: vscode.TextDocument
): {
    /**
     * The visual diff that is suitable for rendering.
     */
    diff: VisualDiff
    /**
     * The area in the document at which the diff should be rendered.
     * Line: Should match the first relevant line of the diff.
     * Column: Should be the end column of the longest line in the diff. Ensures no existing code is overlapped.
     */
    position: { line: number; column: number }
} {
    const visualDiff = prepareVisualDiff(decorationInfo, mode)
    const blockifiedDiff = blockify(visualDiff, document)
    const position = getDiffTargetPosition(blockifiedDiff, document)
    return { diff: blockifiedDiff, position }
}

/**
 * Given a decoration info, this function will return a diff that is suitable for rendering.
 * It also supports transforming the diff into a unified diff.
 */
export function prepareVisualDiff(decorationInfo: AutoeditDiff, mode: DiffMode): VisualDiff {
    const sortedDiff = [
        ...decorationInfo.addedLines,
        ...decorationInfo.modifiedLines,
        ...decorationInfo.unchangedLines,
        ...decorationInfo.removedLines,
    ].sort((a, b) => {
        const aLine = a.type === 'removed' ? a.originalLineNumber : a.modifiedLineNumber
        const bLine = b.type === 'removed' ? b.originalLineNumber : b.modifiedLineNumber

        if (aLine === bLine) {
            // We have a conflict, this is because the same line number has been used for both added and removed lines.
            // To make a visually appealing diff, we need to ensure that we order these conflicts like so:
            // removed -> added -> modified -> unchanged
            const typeOrder = {
                removed: 0,
                added: 1,
                modified: 2,
                unchanged: 3,
            }
            return typeOrder[a.type] - typeOrder[b.type]
        }

        return aLine - bLine
    })

    // We do not care about unchanged lines above or below the first relevant lines
    const firstRelevantLine = sortedDiff.findIndex(line => line.type !== 'unchanged')
    const lastRelevantLine = sortedDiff.findLastIndex(line => line.type !== 'unchanged')
    const relevantDiff = sortedDiff.slice(firstRelevantLine, lastRelevantLine + 1)

    if (relevantDiff.length === 0 || relevantDiff.every(line => line.type === 'unchanged')) {
        // No useful diff to display, do nothing.
        return { mode, lines: [] }
    }

    if (mode === 'additions') {
        // We only care about existing and new lines here.
        const lines = relevantDiff
            .filter(line => ['added', 'modified', 'unchanged'].includes(line.type))
            .map(line => {
                if (line.type === 'modified') {
                    return {
                        type: 'modified-added' as const,
                        text: line.newText,
                        changes: line.changes,
                        originalLineNumber: line.originalLineNumber,
                        modifiedLineNumber: line.modifiedLineNumber,
                        syntaxHighlights: {
                            dark: [],
                            light: [],
                        },
                    }
                }
                return {
                    ...line,
                    syntaxHighlights: {
                        dark: [],
                        light: [],
                    },
                }
            })
        return { mode, lines }
    }

    // We need to transform the diff into a unified diff
    // This will involve splitting modified lines into two lines and grouping additions and deletions together
    const lines: VisualDiffLine[] = []
    const deletions: VisualDiffLine[] = []
    const additions: VisualDiffLine[] = []

    for (let i = 0; i < relevantDiff.length; i++) {
        const line = relevantDiff[i]

        if (line.type === 'modified') {
            const additionsOnly = isOnlyAddingTextForModifiedLines([line])
            if (!additionsOnly) {
                // The modified line includes a deletion, we need to ensure this is represented in the diff
                deletions.push({
                    type: 'modified-removed',
                    text: line.oldText,
                    changes: line.changes,
                    originalLineNumber: line.originalLineNumber,
                    modifiedLineNumber: line.modifiedLineNumber,
                    syntaxHighlights: {
                        dark: [],
                        light: [],
                    },
                })
            }

            // We always want to show additions for modified lines
            additions.push({
                type: 'modified-added',
                text: line.newText,
                changes: line.changes,
                originalLineNumber: line.originalLineNumber,
                modifiedLineNumber: line.modifiedLineNumber,
                syntaxHighlights: {
                    dark: [],
                    light: [],
                },
            })
        } else if (line.type === 'removed') {
            deletions.push({
                ...line,
                syntaxHighlights: {
                    dark: [],
                    light: [],
                },
            })
        } else if (line.type === 'added') {
            additions.push({
                ...line,
                syntaxHighlights: {
                    dark: [],
                    light: [],
                },
            })
        } else {
            // We have hit an unchanged line, we can now flush any pending deletions/additions
            // in the desired order, and continue with the unchanged line
            if (deletions.length > 0 || additions.length > 0) {
                lines.push(...deletions, ...additions)
                // Clear the arrays
                deletions.length = 0
                additions.length = 0
            }
            lines.push({
                ...line,
                syntaxHighlights: {
                    dark: [],
                    light: [],
                },
            })
        }
    }

    // End of the diff, ensure we have flushed any pending deletions/additions
    if (deletions.length > 0 || additions.length > 0) {
        lines.push(...deletions, ...additions)
    }

    return { mode, lines }
}
