import type { BundledLanguage } from 'shiki/langs'
import type { AddedLinesDecorationInfo } from '../decorators/default-decorator'
import { drawTokensToCanvas, initCanvas } from './canvas'
import { highlightDecorations, initHighlighter } from './highlight'

export async function initImageSuggestionService() {
    return Promise.all([initHighlighter(), initCanvas()])
}

interface SuggestionOptions {
    decorations: AddedLinesDecorationInfo[]
    lang: BundledLanguage
}

export function generateSuggestionAsImage(options: SuggestionOptions): { light: string; dark: string } {
    const { decorations, lang } = options

    const highlightedLightDecorations = highlightDecorations(decorations, lang, 'light')
    const highlightedDarkDecorations = highlightDecorations(decorations, lang, 'dark')

    return {
        dark: drawTokensToCanvas(highlightedDarkDecorations).toDataURL('image/png'),
        light: drawTokensToCanvas(highlightedLightDecorations).toDataURL('image/png'),
    }
}
