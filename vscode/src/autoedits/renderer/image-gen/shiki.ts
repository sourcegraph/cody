import type { BundledLanguage, HighlighterGeneric } from 'shiki/types.mjs'
import type { MultiLineSupportedLanguage } from '../../../completions/detect-multiline'

export type ShikiLanguage = 'bash' | 'text' | 'tsx' | 'typescript'
export type ShikiTheme = 'vitesse-light' | 'vitesse-dark'

export const SYNTAX_HIGHLIGHT_THEMES = ['vitesse-light', 'vitesse-dark'] as const

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

export const getShiki = async () => {
    const createHighlighterCore = await import('shiki/core').then(mod => mod.createHighlighterCore)
    const getWasm = await import('shiki/wasm')

    const highlighter = await createHighlighterCore({
        themes: SYNTAX_HIGHLIGHT_THEMES.map(theme => import(`shiki/themes/${theme}.mjs`)),
        langs: Object.values(SYNTAX_HIGHLIGHT_MAPPING).map(lang => import(`shiki/langs/${lang}.mjs`)),
        loadWasm: getWasm,
    })

    return highlighter as HighlighterGeneric<BundledLanguage, string>
}
