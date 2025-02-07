import type {
    AddedLineInfo,
    DecorationInfo,
    DecorationLineInfo,
    ModifiedLineInfo,
    RemovedLineInfo,
    UnchangedLineInfo,
} from '../decorators/base'
import { drawDecorationsToCanvas, initCanvas } from './canvas'
import { initSyntaxHighlighter, syntaxHighlightDecorations } from './highlight'

export async function initImageSuggestionService() {
    return Promise.all([initSyntaxHighlighter(), initCanvas()])
}

interface SuggestionOptions {
    decorations: DecorationInfo
    lang: string
    mode: 'additions' | 'unified'
}

export function generateSuggestionAsImage({ lang, decorations, mode }: SuggestionOptions): {
    light: string
    dark: string
} {
    const diff = makeDecoratedDiff(decorations, lang, mode)
    return {
        dark: drawDecorationsToCanvas(diff.dark, 'dark', mode).toDataURL('image/png'),
        light: drawDecorationsToCanvas(diff.light, 'light', mode).toDataURL('image/png'),
    }
}

export interface DecoratedDiff {
    lines: DecorationLineInfo[]
}

export function makeDecoratedDiff(
    decorationInfo: DecorationInfo,
    lang: string,
    mode: 'additions' | 'unified'
): { dark: VisualDiff; light: VisualDiff } {
    const visualDiff = makeVisualDiff(decorationInfo, mode)
    return {
        dark: syntaxHighlightDecorations(visualDiff, lang, 'dark'),
        light: syntaxHighlightDecorations(visualDiff, lang, 'light'),
    }
}

export interface ModifiedLineInfoAdded
    extends Omit<ModifiedLineInfo, 'type' | 'oldText' | 'oldHighlights'> {
    type: 'modified-added'
}

export interface ModifiedLineInfoRemoved
    extends Omit<ModifiedLineInfo, 'type' | 'newText' | 'newHighlights'> {
    type: 'modified-removed'
}

export type VisualDiffLine =
    | AddedLineInfo
    | RemovedLineInfo
    | ModifiedLineInfo
    | ModifiedLineInfoAdded
    | ModifiedLineInfoRemoved
    | UnchangedLineInfo

/**
 * VisualDiff is an abstraction over DecoratedDiff that is suitable for rendering.
 * It is an ordered list of relevant lines that we can simply iterate over and render.
 *
 * It supports `ModifiedLineInfoAdded` and `ModifiedLineInfoRemoved` to represent the two sides of a modified line.
 * This is useful for rendering a unified diff
 */
export interface VisualDiff {
    lines: VisualDiffLine[]
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
        // We do not need to do anything else for additions. An ordered diff is enough
        // for us to start rendering.
        return { lines: relevantDiff }
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
            deletions.push({ ...line, type: 'modified-removed' })
            additions.push({ ...line, type: 'modified-added' })
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

    return { lines }
}
