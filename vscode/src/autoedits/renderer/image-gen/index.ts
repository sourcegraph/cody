import { isMacOS } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type {
    AddedLineInfo,
    DecorationInfo,
    DecorationLineInfo,
    LineChange,
    ModifiedLineInfo,
    RemovedLineInfo,
    SyntaxHighlight,
    UnchangedLineInfo,
} from '../decorators/base'
import { blockify } from '../decorators/blockify-new'
import { DIFF_COLORS, drawDecorationsToCanvas, initCanvas } from './canvas'
import { initSyntaxHighlighter, syntaxHighlightDecorations } from './highlight'

export async function initImageSuggestionService() {
    return Promise.all([initSyntaxHighlighter(), initCanvas()])
}

interface SuggestionOptions {
    decorations: DecorationInfo
    lang: string
    mode: 'additions' | 'unified'
    document: vscode.TextDocument
}

export function generateSuggestionAsImage({ lang, decorations, mode, document }: SuggestionOptions): {
    light: string
    dark: string
} {
    const diff = makeDecoratedDiff(decorations, lang, mode, document)
    const { fontSize, lineHeight } = getFontSizeAndLineHeight()
    const renderConfig = {
        fontSize,
        lineHeight,
        padding: { x: 2, y: 2 },
        maxWidth: 600,
        pixelRatio: 2,
        diffColors: DIFF_COLORS,
    }
    return {
        dark: drawDecorationsToCanvas(diff.dark, 'dark', mode, renderConfig).toDataURL('image/png'),
        light: drawDecorationsToCanvas(diff.light, 'light', mode, renderConfig).toDataURL('image/png'),
    }
}

export interface DecoratedDiff {
    lines: DecorationLineInfo[]
}

export function getDefaultLineHeight(fontSize: number): number {
    // TODO: What about Linux?
    const GOLDEN_LINE_HEIGHT_RATIO = isMacOS() ? 1.5 : 1.35
    const MINIMUM_LINE_HEIGHT = 8

    const userSpecifiedLineHeight =
        vscode.workspace.getConfiguration('editor').get<number>('lineHeight') || 0

    if (userSpecifiedLineHeight === 0) {
        // 0 is the default
        return Math.round(GOLDEN_LINE_HEIGHT_RATIO * fontSize) // fontSize is editor.fontSize
    }

    if (userSpecifiedLineHeight < MINIMUM_LINE_HEIGHT) {
        // VS Code won't use this line height, lets return the safe minimum
        return MINIMUM_LINE_HEIGHT
    }

    // Return the user preference
    return userSpecifiedLineHeight
}

export function getFontSizeAndLineHeight(): { fontSize: number; lineHeight: number } {
    const fontSize = vscode.workspace.getConfiguration('editor').get<number>('fontSize') || 12
    const lineHeight = getDefaultLineHeight(fontSize)
    return { fontSize, lineHeight }
}

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

interface BaseModifiedLineSplit {
    type: 'modified-added' | 'modified-removed'
    changes: LineChange[]
    originalLineNumber: number
    modifiedLineNumber: number
}

// TODO: Remove `newText` and `newHighlights` from this interface
// makes the code a lot simpler and new/old doesn't make sense for these types
export interface ModifiedLineInfoAdded extends BaseModifiedLineSplit {
    type: 'modified-added'
    text: string
    highlights: SyntaxHighlight
}
// TODO: Remove `oldText` and `oldHighlights` from this interface
// makes the code a lot simpler and new/old doesn't make sense for these types
export interface ModifiedLineInfoRemoved extends BaseModifiedLineSplit {
    type: 'modified-removed'
    text: string
    highlights: SyntaxHighlight
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

    return { lines }
}
