import { type BundledLanguage, type Highlighter, type ThemedToken, createHighlighter } from 'shiki'
import type { MultiLineSupportedLanguage } from '../../../completions/detect-multiline'
import type { AddedLinesDecorationInfo } from '../decorators/default-decorator'

export interface HighlightedAddedLinesDecorationInfo extends AddedLinesDecorationInfo {
    highlightedTokens?: ThemedToken[]
}

let highlighter: Highlighter | null = null

export const HIGHLIGHT_THEMES = {
    light: 'vitesse-light',
    dark: 'vitesse-dark',
} as const

/**
 * Mapping of supported completiion languages to highlighter languages
 */
export const SYNTAX_HIGHLIGHT_MAPPING: Record<MultiLineSupportedLanguage, BundledLanguage> = {
    astro: 'astro',
    c: 'c',
    cpp: 'cpp',
    csharp: 'csharp',
    css: 'css',
    dart: 'dart',
    elixir: 'elixir',
    go: 'go',
    html: 'html',
    java: 'java',
    javascript: 'javascript',
    javascriptreact: 'jsx',
    kotlin: 'kotlin',
    php: 'php',
    python: 'python',
    rust: 'rust',
    svelte: 'svelte',
    typescript: 'typescript',
    typescriptreact: 'tsx',
    vue: 'vue',
}

export async function initHighlighter(): Promise<void> {
    if (!highlighter) {
        highlighter = await createHighlighter({
            themes: Object.values(HIGHLIGHT_THEMES),
            langs: Object.values(SYNTAX_HIGHLIGHT_MAPPING),
        })
    }
}

export function highlightDecorations(
    decorations: AddedLinesDecorationInfo[],
    lang: BundledLanguage,
    mode: keyof typeof HIGHLIGHT_THEMES
): HighlightedAddedLinesDecorationInfo[] {
    if (!highlighter) {
        throw new Error('Highlighter not initialized')
    }

    // Rebuild the codeblock ready for it to be highlighted
    const code = decorations.map(({ lineText }) => lineText).join('\n')

    const { tokens } = highlighter.codeToTokens(code, {
        theme: HIGHLIGHT_THEMES[mode],
        lang,
    })

    // Merge the highlighted tokens back with the decoration info
    return decorations.map((decoration, index) => ({
        ...decoration,
        highlightedTokens: tokens[index] || [],
    }))
}
