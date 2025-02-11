import * as vscode from 'vscode'
import type { AddedLinesDecorationInfo } from '../decorators/default-decorator'
import { drawDecorationsToCanvas, initCanvas } from './canvas'
import type { UserProvidedRenderConfig } from './canvas/render-config'
import { initSyntaxHighlighter, syntaxHighlightDecorations } from './highlight'

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

interface SuggestionOptions {
    decorations: AddedLinesDecorationInfo[]
    lang: string
    /**
     * Note: This is currently only used for test stability, as the default font size / line height will
     * differ between platforms.
     */
    config?: UserProvidedRenderConfig
}

export function generateSuggestionAsImage(options: SuggestionOptions): { light: string; dark: string } {
    const { decorations, lang } = options
    const renderConfig: UserProvidedRenderConfig = options.config || {
        // The image should be rendered using the same font size as the existing text in the editor.
        fontSize: getFontSizeFromUserSettings(),
    }

    const darkDecorations = syntaxHighlightDecorations(decorations, lang, 'dark')
    const lightDecorations = syntaxHighlightDecorations(decorations, lang, 'light')

    return {
        dark: drawDecorationsToCanvas(darkDecorations, 'dark', renderConfig).toDataURL('image/png'),
        light: drawDecorationsToCanvas(lightDecorations, 'light', renderConfig).toDataURL('image/png'),
    }
}
