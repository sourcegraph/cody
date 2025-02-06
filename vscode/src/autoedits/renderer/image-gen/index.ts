import type { DecorationInfo, DecorationLineInfo } from '../decorators/base'
import type { AddedLinesDecorationInfo } from '../decorators/default-decorator'
import { drawDecorationsToCanvas, initCanvas } from './canvas'
import {
    type SYNTAX_HIGHLIGHT_MODE,
    initSyntaxHighlighter,
    syntaxHighlightDecorations,
} from './highlight'

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
    console.log('umpox: going...')
    const decoratedDiff = makeDecoratedDiff(newDecorationInfo, lang, 'dark')

    console.log('umpox: GOT DECORATED DIFF', decoratedDiff)
    return {
        dark: drawDecorationsToCanvas(decoratedDiff, 'dark').toDataURL('image/png'),
        light: drawDecorationsToCanvas(decoratedDiff, 'light').toDataURL('image/png'),
    }
}

export interface DecoratedDiff {
    lines: DecorationLineInfo[]
}

export function makeDecoratedDiff(
    { addedLines, removedLines, modifiedLines, unchangedLines }: DecorationInfo,
    lang: string,
    mode: SYNTAX_HIGHLIGHT_MODE
): DecoratedDiff {
    console.log('Ssorting the diff')
    // Sort the diff so it is in the correct order
    const sortedDiff = [...addedLines, ...modifiedLines, ...unchangedLines, ...removedLines].sort(
        (a, b) => {
            const aLine = a.type === 'removed' ? a.originalLineNumber : a.modifiedLineNumber
            const bLine = b.type === 'removed' ? b.originalLineNumber : b.modifiedLineNumber
            return aLine - bLine
        }
    )

    // We do not care about unchanged lines above or below the first relevant lines
    const firstRelevantLine = sortedDiff.findIndex(line => line.type !== 'unchanged')
    console.log('find last index')
    const lastRelevantLine = sortedDiff.findLastIndex(line => line.type !== 'unchanged')
    const relevantDiff = sortedDiff.slice(firstRelevantLine, lastRelevantLine + 1)

    console.log('umpox: getting highlights...')
    const darkHighlights = syntaxHighlightDecorations({ lines: relevantDiff }, lang, 'dark')
    // const lightHighlights = syntaxHighlightDecorations({ lines: relevantDiff }, lang, 'light')

    console.log('umpox: got highlights')
    return darkHighlights
}
