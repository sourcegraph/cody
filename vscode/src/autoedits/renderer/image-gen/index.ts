import type { MultiLineSupportedLanguage } from '../../../completions/detect-multiline'
import type { AddedLinesDecorationInfo } from '../decorators/default-decorator'
import { drawTokensToCanvas, initCanvas } from './canvas'
import { highlightDecorations, initHighlighter } from './highlight'
import { SYNTAX_HIGHLIGHT_MAPPING } from './shiki'

export async function initImageSuggestionService() {
    return Promise.all([initHighlighter(), initCanvas()])
}

interface SuggestionOptions {
    decorations: AddedLinesDecorationInfo[]
    lang: string
}

export function generateSuggestionAsImage(options: SuggestionOptions): { light: string; dark: string } {
    const { decorations, lang } = options
    const highlightingLang = SYNTAX_HIGHLIGHT_MAPPING[lang as MultiLineSupportedLanguage]

    const darkDecorations = highlightingLang
        ? highlightDecorations(decorations, highlightingLang, 'dark')
        : decorations
    const lightDecorations = highlightingLang
        ? highlightDecorations(decorations, highlightingLang, 'light')
        : decorations

    return {
        dark: drawTokensToCanvas(darkDecorations, 'dark').toDataURL('image/png'),
        light: drawTokensToCanvas(lightDecorations, 'light').toDataURL('image/png'),
    }
}
