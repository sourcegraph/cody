import { initCanvas } from './canvas'
import { drawDecorationsToCanvas } from './canvas/draw-decorations'
import {
    type RenderConfig,
    type UserProvidedRenderConfig,
    getRenderConfig,
} from './canvas/render-config'
import { makeDecoratedDiff } from './decorated-diff'
import { initSyntaxHighlighter } from './highlight'
import type { DiffMode, VisualDiff } from './visual-diff/types'

export async function initImageSuggestionService() {
    return Promise.all([initSyntaxHighlighter(), initCanvas()])
}

interface ImageSuggestionOptions {
    diff: VisualDiff
    lang: string
    mode: DiffMode
    /**
     * Note: This is currently only used for test stability, as the default font size / line height will
     * differ between platforms.
     */
    config?: UserProvidedRenderConfig
}

export interface GeneratedImageSuggestion {
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

export function generateSuggestionAsImage(options: ImageSuggestionOptions): GeneratedImageSuggestion {
    const { diff, lang, config, mode } = options
    const highlightedDiff = makeDecoratedDiff(diff, lang)
    const renderConfig = getRenderConfig(config)

    return {
        dark: renderSuggestionImage(highlightedDiff.dark, 'dark', mode, renderConfig),
        light: renderSuggestionImage(highlightedDiff.light, 'light', mode, renderConfig),
        pixelRatio: renderConfig.pixelRatio,
    }
}

function renderSuggestionImage(
    diff: VisualDiff,
    theme: 'dark' | 'light',
    mode: DiffMode,
    renderConfig: RenderConfig
) {
    const canvas = drawDecorationsToCanvas(diff, theme, mode, renderConfig)
    const image = canvas.toDataURL('image/png')
    canvas.dispose()
    return image
}
