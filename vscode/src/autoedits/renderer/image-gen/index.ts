import type { AddedLinesDecorationInfo } from '../decorators/default-decorator'
import { drawDecorationsToCanvas, initCanvas } from './canvas'
import { type UserProvidedRenderConfig, getRenderConfig } from './canvas/render-config'
import { initSyntaxHighlighter, syntaxHighlightDecorations } from './highlight'

export async function initImageSuggestionService() {
    return Promise.all([initSyntaxHighlighter(), initCanvas()])
}

interface SuggestionOptions {
    decorations: AddedLinesDecorationInfo[]
    lang: string
    /**
     * Note: This is currently only used for test stability, as the default font size / line height will
     * differ between platforms.
     */
    config?: UserProvidedRenderConfig
}

interface GeneratedSuggestion {
    /* Base64 encoded image suitable for rendering in dark editor themes */
    dark: string
    /* Base64 encoded image suitable for rendering in light editor themes */
    light: string
    /**
     * The pixel ratio used to generate the image. Should be used to scale the image appropriately.
     * Has a minimum value of 1.
     */
    pixelRatio: number
}

export function generateSuggestionAsImage(options: SuggestionOptions): GeneratedSuggestion {
    const { decorations, lang, config } = options
    const renderConfig = getRenderConfig(config)

    const darkDecorations = syntaxHighlightDecorations(decorations, lang, 'dark')
    const lightDecorations = syntaxHighlightDecorations(decorations, lang, 'light')

    return {
        dark: drawDecorationsToCanvas(darkDecorations, 'dark', renderConfig).toDataURL('image/png'),
        light: drawDecorationsToCanvas(lightDecorations, 'light', renderConfig).toDataURL('image/png'),
        pixelRatio: renderConfig.pixelRatio,
    }
}
