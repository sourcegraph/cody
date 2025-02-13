import * as vscode from 'vscode'
import type { DecorationInfo } from '../decorators/base'
import { initCanvas } from './canvas'
import { drawDecorationsToCanvas } from './canvas/draw-decorations'
import type { UserProvidedRenderConfig } from './canvas/render-config'
import { makeDecoratedDiff } from './decorated-diff'
import { initSyntaxHighlighter } from './highlight'

export async function initImageSuggestionService() {
    return Promise.all([initSyntaxHighlighter(), initCanvas()])
}

function getFontSizeFromUserSettings(): number | undefined {
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

export function generateSuggestionAsImage({
    lang,
    decorations,
    mode,
    document,
    config,
}: SuggestionOptions): {
    light: string
    dark: string
} {
    const renderConfig: UserProvidedRenderConfig = config || {
        // The image should be rendered using the same font size as the existing text in the editor.
        fontSize: getFontSizeFromUserSettings(),
    }
    const diff = makeDecoratedDiff(decorations, lang, mode, document)
    return {
        dark: drawDecorationsToCanvas(diff.dark, 'dark', mode, renderConfig).toDataURL('image/png'),
        light: drawDecorationsToCanvas(diff.light, 'light', mode, renderConfig).toDataURL('image/png'),
    }
}
