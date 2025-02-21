import type * as vscode from 'vscode'
import type { DecorationInfo } from '../decorators/base'
import { initCanvas } from './canvas'
import { drawDecorationsToCanvas } from './canvas/draw-decorations'
import { type UserProvidedRenderConfig, getRenderConfig } from './canvas/render-config'
import { makeDecoratedDiff } from './decorated-diff'
import { initSyntaxHighlighter } from './highlight'
import { getDiffPosition } from './utils'

export async function initImageSuggestionService() {
    return Promise.all([initSyntaxHighlighter(), initCanvas()])
}

export type DiffMode = 'additions' | 'unified'

interface SuggestionOptions {
    decorations: DecorationInfo
    lang: string
    mode: DiffMode
    document: vscode.TextDocument
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
    /**
     * The position in the editor where the image should be rendered.
     */
    position: {
        line: number
        character: number
    }
}

export function generateSuggestionAsImage(options: SuggestionOptions): GeneratedSuggestion {
    const { decorations, lang, config, mode, document } = options
    const diff = makeDecoratedDiff(decorations, lang, mode, document)
    const renderConfig = getRenderConfig(config)

    // TODO: Smell, diff.dark because we only care about the diff
    const position = getDiffPosition(diff.dark, document)

    return {
        dark: drawDecorationsToCanvas(diff.dark, 'dark', mode, renderConfig).toDataURL('image/png'),
        light: drawDecorationsToCanvas(diff.light, 'light', mode, renderConfig).toDataURL('image/png'),
        pixelRatio: renderConfig.pixelRatio,
        position,
    }
}
