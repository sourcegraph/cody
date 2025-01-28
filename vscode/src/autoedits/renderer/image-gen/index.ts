import type { AddedLinesDecorationInfo } from '../decorators/default-decorator'
import { drawDecorationsToCanvas, initCanvas } from './canvas'
import { initSyntaxHighlighter, syntaxHighlightDecorations } from './highlight'

export async function initImageSuggestionService() {
    return Promise.all([initSyntaxHighlighter(), initCanvas()])
}

interface SuggestionOptions {
    decorations: AddedLinesDecorationInfo[]
    lang: string
}

export function generateSuggestionAsImage(options: SuggestionOptions): { light: string; dark: string } {
    const { decorations, lang } = options

    const darkDecorations = syntaxHighlightDecorations(decorations, lang, 'dark')
    const lightDecorations = syntaxHighlightDecorations(decorations, lang, 'light')

    return {
        dark: drawDecorationsToCanvas(darkDecorations, 'dark').toDataURL('image/png'),
        light: drawDecorationsToCanvas(lightDecorations, 'light').toDataURL('image/png'),
    }
}
