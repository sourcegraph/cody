import { isMacOS } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { localStorage } from '../../../../services/LocalStorageProvider'

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

/**
 * Use a default pixel ratio that works for both high and low DPI screens.
 * Note: A pixel ratio is 2 is preferred for high DPI screens, however this
 * causes significant blurriness when the image is downscaled on low DPI screens.
 *
 * This value is significantly preferrable to '2' for low DPI screens. I am unsure
 * exactly why this is the case. It possibly could be an issue with how VS Code handles image scaling.
 * You can see the diference in this PR: https://github.com/sourcegraph/cody/pull/7100
 */
const DEFAULT_PIXEL_RATIO = 1.95

function getUserLineHeight(fontSize: number): number {
    return Math.round(GOLDEN_LINE_HEIGHT_RATIO * fontSize)
}

function getUserFontSize(): number | undefined {
    // Extract the font size from VS Code user settings.
    // Note: VS Code warns but technically supports string-based font sizes, e.g. "14".
    // TODO: Support this for other editors. We should respect the font size in editors like JetBrains.
    const userFontSize = Number(vscode.workspace.getConfiguration('editor').get('fontSize'))

    if (Number.isNaN(userFontSize) || userFontSize <= 0) {
        // We cannot use this font size, we will use a platform specific default
        return
    }

    return userFontSize
}

/**
 * In order to generate the most optimal image, we need to know the pixel ratio of the device.
 * We cannot get this through Node, we need to interface with the Webview.
 * This implementation is a form of progressive enhancement, where we use a suitable default that
 * works for both high and low DPI screens. We then use the pixel ratio available from the Webview
 * if it becomes available.
 */
function getUserPixelRatio(): number | undefined {
    const devicePixelRatio = localStorage.getDevicePixelRatio()
    if (!devicePixelRatio) {
        // No pixel ratio available. User has not opened a Webview yet.
        return
    }

    return Math.max(devicePixelRatio, 1)
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
    pixelRatio?: number
}

export function getRenderConfig(userProvidedConfig?: UserProvidedRenderConfig): RenderConfig {
    const pixelRatio = userProvidedConfig?.pixelRatio || getUserPixelRatio() || DEFAULT_PIXEL_RATIO
    const fontSize = userProvidedConfig?.fontSize || getUserFontSize() || DEFAULT_FONT_SIZE
    const lineHeight = userProvidedConfig?.lineHeight || getUserLineHeight(fontSize)

    return {
        fontSize,
        lineHeight,
        padding: { x: 6, y: 2 },
        maxWidth: 1200,
        pixelRatio,
        diffHighlightColor: 'rgba(35, 134, 54, 0.2)',
    }
}
