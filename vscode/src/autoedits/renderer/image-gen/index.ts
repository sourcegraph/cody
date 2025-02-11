import type * as vscode from 'vscode'
import type { DecorationInfo } from '../decorators/base'
import { drawDecorationsToCanvas, initCanvas } from './canvas'
import { makeDecoratedDiff } from './decorated-diff'
import { initSyntaxHighlighter } from './highlight'

export async function initImageSuggestionService() {
    return Promise.all([initSyntaxHighlighter(), initCanvas()])
}

export type DiffMode = 'additions' | 'unified'

interface SuggestionOptions {
    decorations: DecorationInfo
    lang: string
    mode: DiffMode
    document: vscode.TextDocument
}

export function generateSuggestionAsImage({ lang, decorations, mode, document }: SuggestionOptions): {
    light: string
    dark: string
} {
    const diff = makeDecoratedDiff(decorations, lang, mode, document)
    return {
        dark: drawDecorationsToCanvas(diff.dark, 'dark', mode).toDataURL('image/png'),
        light: drawDecorationsToCanvas(diff.light, 'light', mode).toDataURL('image/png'),
    }
}
