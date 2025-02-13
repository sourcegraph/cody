import { isMacOS } from '@sourcegraph/cody-shared'

/**
 * This is the ratio that VS Code uses to automatically determine the line height based on the font size.
 * It is referenced in the VS Code source code here: https://sourcegraph.com/github.com/microsoft/vscode@bf4c96/-/blob/src/vs/editor/common/config/fontInfo.ts?L10-14
 */
const GOLDEN_LINE_HEIGHT_RATIO = isMacOS() ? 1.5 : 1.35

/**
 * This is the default font size that VS Code uses when rendering text.
 * It is referenced in the VS Code source code here: https://sourcegraph.com/github.com/microsoft/vscode@bf4c96/-/blob/src/vs/editor/common/config/editorOptions.ts?L5410-5420
 */
const DEFAULT_FONT_SIZE = isMacOS() ? 12 : 14

export function getLineHeight(fontSize: number): number {
    return Math.round(GOLDEN_LINE_HEIGHT_RATIO * fontSize)
}

/**
 * Options to render the auto-edit suggestion to the canvas.
 * This should be configurable by the user and/or the client where suitable.
 */
export interface RenderConfig {
    fontSize: number
    lineHeight: number
    padding: { x: number; y: number }
    maxWidth: number
    /**
     * The ratio at which to upscale the canvas. Used to increase resolution of the image.
     */
    pixelRatio: number
    /**
     * The background color of added characters in the diff.
     */
    diffHighlightColor: string
}

export interface UserProvidedRenderConfig {
    fontSize?: number
    lineHeight?: number
}

export function getRenderConfig(userProvidedConfig: UserProvidedRenderConfig): RenderConfig {
    const fontSize = userProvidedConfig.fontSize || DEFAULT_FONT_SIZE
    const lineHeight = userProvidedConfig.lineHeight || getLineHeight(fontSize)
    return {
        fontSize,
        lineHeight,
        padding: { x: 6, y: 2 },
        maxWidth: 1200,
        pixelRatio: 2,
        diffHighlightColor: 'rgba(35, 134, 54, 0.2)',
    }
}
