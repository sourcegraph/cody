import { createHighlighterCore } from 'shiki/core'
import { createOnigurumaEngine } from 'shiki/engine/oniguruma'
import type { BundledLanguage, BundledTheme, HighlighterGeneric } from 'shiki/types.mjs'
import getWasm from 'shiki/wasm'
import type { MultiLineSupportedLanguage } from '../../../completions/detect-multiline'
import type { SYNTAX_HIGHLIGHT_MODE } from './highlight'

/**
 * Mapping of highlight modes to supported themes.
 * Note: We are unable to extract the exact syntax highlighting colors from the users' editor.
 * These themes have been selected as they work well across most editor themes.
 * We can consider changing this, or provide options for the user to select another theme.
 */
export const SYNTAX_HIGHLIGHTING_THEMES: Record<
    SYNTAX_HIGHLIGHT_MODE,
    { name: BundledTheme; module: Promise<any> }
> = {
    light: { name: 'vitesse-light', module: import('shiki/themes/vitesse-light.mjs') },
    dark: { name: 'vitesse-dark', module: import('shiki/themes/vitesse-dark.mjs') },
} as const

/**
 * Mapping of support completion languages (referenced via vscode.languageId) to
 * Shiki syntax highlighting languages
 */
export const SYNTAX_HIGHLIGHTING_LANGUAGES: Record<
    MultiLineSupportedLanguage,
    { name: BundledLanguage; module: Promise<any> }
> = {
    astro: { name: 'astro', module: import('shiki/langs/astro.mjs') },
    c: { name: 'c', module: import('shiki/langs/c.mjs') },
    cpp: { name: 'cpp', module: import('shiki/langs/cpp.mjs') },
    csharp: { name: 'csharp', module: import('shiki/langs/csharp.mjs') },
    css: { name: 'css', module: import('shiki/langs/css.mjs') },
    dart: { name: 'dart', module: import('shiki/langs/dart.mjs') },
    elixir: { name: 'elixir', module: import('shiki/langs/elixir.mjs') },
    go: { name: 'go', module: import('shiki/langs/go.mjs') },
    html: { name: 'html', module: import('shiki/langs/html.mjs') },
    java: { name: 'java', module: import('shiki/langs/java.mjs') },
    javascript: { name: 'javascript', module: import('shiki/langs/javascript.mjs') },
    javascriptreact: { name: 'jsx', module: import('shiki/langs/jsx.mjs') },
    kotlin: { name: 'kotlin', module: import('shiki/langs/kotlin.mjs') },
    php: { name: 'php', module: import('shiki/langs/php.mjs') },
    python: { name: 'python', module: import('shiki/langs/python.mjs') },
    rust: { name: 'rust', module: import('shiki/langs/rust.mjs') },
    svelte: { name: 'svelte', module: import('shiki/langs/svelte.mjs') },
    typescript: { name: 'typescript', module: import('shiki/langs/typescript.mjs') },
    typescriptreact: { name: 'tsx', module: import('shiki/langs/tsx.mjs') },
    vue: { name: 'vue', module: import('shiki/langs/vue.mjs') },
} as const

export const getShiki = async () => {
    const highlighter = await createHighlighterCore({
        themes: Object.values(SYNTAX_HIGHLIGHTING_THEMES).map(theme => theme.module),
        langs: Object.values(SYNTAX_HIGHLIGHTING_LANGUAGES).map(lang => lang.module),
        engine: createOnigurumaEngine(getWasm),
    })

    return highlighter as HighlighterGeneric<BundledLanguage, string>
}
