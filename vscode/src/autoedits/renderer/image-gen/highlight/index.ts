import type { BundledLanguage, HighlighterGeneric } from 'shiki/types.mjs'

import { getShiki } from './shiki'

export let syntaxHighlighter: HighlighterGeneric<BundledLanguage, string> | null = null

export async function initSyntaxHighlighter(): Promise<void> {
    if (!syntaxHighlighter) {
        syntaxHighlighter = await getShiki()
    }
}
