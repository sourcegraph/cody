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

    const lines: VisualDiffLine[] = []
    for (let i = 0; i < relevantDiff.length; i++) {
        const line = relevantDiff[i]
        if (line.type === 'modified' && mode === 'unified') {
            // Split the modified line into two lines, one for the removed and one for the added text
            const modifiedLine = line as ModifiedLineInfo
            const removedLine: ModifiedLineInfoRemoved = {
                ...modifiedLine,
                type: 'modified-removed',
            }
            const addedLine: ModifiedLineInfoAdded = {
                ...modifiedLine,
                type: 'modified-added',
            }
            lines.push(removedLine, addedLine)
            continue
        }
        lines.push(line)
    }

    return { lines }
}
