import * as vscode from 'vscode'
import type { AddedLinesDecorationInfo } from '../decorators/default-decorator'
import { drawDecorationsToCanvas, initCanvas } from './canvas'
import type { UserProvidedRenderConfig } from './canvas/render-config'
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

export function generateSuggestionAsImage(options: SuggestionOptions): { light: string; dark: string } {
    const { decorations, lang } = options
    const renderConfig: UserProvidedRenderConfig = options.config || {
        // The image should be rendered using the same font size as the existing text in the editor.
        // TODO: It should be possible for this value to be set by different clients (e.g. JetBrains)
        fontSize: vscode.workspace.getConfiguration('editor').get<number>('fontSize'),
    }

    const darkDecorations = syntaxHighlightDecorations(decorations, lang, 'dark')
    const lightDecorations = syntaxHighlightDecorations(decorations, lang, 'light')

    return {
        dark: drawDecorationsToCanvas(darkDecorations, 'dark', renderConfig).toDataURL('image/png'),
        light: drawDecorationsToCanvas(lightDecorations, 'light', renderConfig).toDataURL('image/png'),
    }
}
