import * as vscode from 'vscode'
import { AddedLineInfo, DecorationInfo, ModifiedLineInfo, UnchangedLineInfo } from '../decorators/base'
import type { AddedLinesDecorationInfo } from '../decorators/default-decorator'
import { drawDecorationsToCanvas, initCanvas } from './canvas'
import { SYNTAX_HIGHLIGHT_MODE, initSyntaxHighlighter, syntaxHighlightDecorations } from './highlight'

export async function initImageSuggestionService() {
    return Promise.all([initSyntaxHighlighter(), initCanvas()])
}

interface SuggestionOptions {
    decorations: AddedLinesDecorationInfo[]
    newDecorationInfo: DecorationInfo
    lang: string
}

export function generateSuggestionAsImage(options: SuggestionOptions): { light: string; dark: string } {
    const { lang, newDecorationInfo } = options
    const decoratedDiff = makeDecoratedDiff(newDecorationInfo, lang, 'dark')

    return {
        dark: drawDecorationsToCanvas(decoratedDiff, 'dark').toDataURL('image/png'),
        light: drawDecorationsToCanvas(decoratedDiff, 'light').toDataURL('image/png'),
    }
}

export interface SyntaxHighlightedArea {
    range: vscode.Range
    color: string
    text: string
}
export interface DecoratedDiff {
    // TODO: Support removedLines too for the unified diff
    diff: (AddedLineInfo | ModifiedLineInfo | UnchangedLineInfo)[]
    syntaxHighlighting: {
        dark: SyntaxHighlightedArea[][]
        light: SyntaxHighlightedArea[][]
    }
    type: 'additions' | 'unified'
}

export function makeDecoratedDiff(
    { addedLines, removedLines, modifiedLines, unchangedLines }: DecorationInfo,
    lang: string,
    mode: SYNTAX_HIGHLIGHT_MODE
): DecoratedDiff {
    // TODO: Support showing removed lines for the unified diff
    console.log('removedLines are unused', removedLines)

    // Sort the diff so it is in the correct order
    const sortedDiff = [...addedLines, ...modifiedLines, ...unchangedLines].sort((a, b) => {
        return a.modifiedLineNumber - b.modifiedLineNumber
    })

    // We do not care about unchanged lines above or below the first relevant lines
    const firstRelevantLine = sortedDiff.findIndex(line => line.type !== 'unchanged')
    const lastRelevantLine = sortedDiff.findLastIndex(line => line.type !== 'unchanged')
    const relevantDiff = sortedDiff.slice(firstRelevantLine, lastRelevantLine + 1)

    return {
        diff: relevantDiff,
        syntaxHighlighting: {
            dark: syntaxHighlightDecorations(relevantDiff, lang, 'dark'),
            light: syntaxHighlightDecorations(relevantDiff, lang, 'light'),
        },
        type: 'additions',
    }
}
