import type { DiffMode, VisualDiff } from '../visual-diff/types'
import { initCanvas } from './canvas'
import { drawDecorationsToCanvas } from './canvas/draw-decorations'
import { type UserProvidedRenderConfig, getRenderConfig } from './canvas/render-config'
import { makeDecoratedDiff } from './decorated-diff'
import { initSyntaxHighlighter } from './highlight'

export async function initImageSuggestionService() {
    return Promise.all([initSyntaxHighlighter(), initCanvas()])
}

interface SuggestionOptions {
    diff: VisualDiff
    lang: string
    mode: DiffMode
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
    const { diff, lang, config, mode } = options
    const highlightedDiff = makeDecoratedDiff(diff, lang)
    const renderConfig = getRenderConfig(config)

    return {
        dark: drawDecorationsToCanvas(highlightedDiff.dark, 'dark', mode, renderConfig).toDataURL(
            'image/png'
        ),
        light: drawDecorationsToCanvas(highlightedDiff.light, 'light', mode, renderConfig).toDataURL(
            'image/png'
        ),
        pixelRatio: renderConfig.pixelRatio,
    }
}
