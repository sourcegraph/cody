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
 *
 * Changes to this value should be manually tested, this is not covered in any CI tests.
 * It can be difficult to manually simulate a low-DPI resolution especially on MacOS, unless you have a physical monitor to hand.
 * One way to test this:
 * 1. Install an Ubuntu VM via UTM, ensure retina mode is disabled in UTM display settings.
 *    Docs: https://docs.getutm.app/guides/ubuntu/.
 * 2. Install VS Code and Cody on the VM.
 * 3. Test image decorations, you can confirm the pixel ratio by inspecting `window.devicePixelRatio` in VS Code DevTools.
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

interface DiffColors {
    inserted: {
        line: string
        text: string
    }
    removed: {
        line: string
        text: string
    }
}

interface ThemedDiffColors {
    dark: DiffColors
    light: DiffColors
}

const DEFAULT_DIFF_COLORS = {
    dark: {
        inserted: {
            line: 'rgba(155, 185, 85, 0.1)',
            text: 'rgba(155, 185, 85, 0.175)',
        },
        removed: {
            line: 'rgba(255, 0, 0, 0.1)',
            text: 'rgba(255, 0, 0, 0.175)',
        },
    },
    light: {
        inserted: {
            line: 'rgba(155, 185, 85, 0.1)',
            text: 'rgba(156, 204, 44, 0.2)',
        },
        removed: {
            line: 'rgba(255, 0, 0, 0.1)',
            text: 'rgba(255, 0, 0, 0.2)',
        },
    },
} satisfies ThemedDiffColors

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
     * The background colors of added characters and lines in the diff.
     */
    diffColors: ThemedDiffColors
    /**
     * The background color of the image.
     * Only currently used for testing purposes.
     * If not provided, the image will be generated with a transparent background
     */
    backgroundColor?: {
        dark: string
        light: string
    }
}

export interface UserProvidedRenderConfig
    extends Partial<Pick<RenderConfig, 'fontSize' | 'lineHeight' | 'pixelRatio' | 'backgroundColor'>> {}

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
        diffColors: DEFAULT_DIFF_COLORS,
        backgroundColor: userProvidedConfig?.backgroundColor,
    }
}
