import { syntaxHighlightDecorations } from '../highlight/highlight-decorations'
import type { VisualDiff } from './types'

export function makeDecoratedDiff(
    diff: VisualDiff,
    lang: string
): { dark: VisualDiff; light: VisualDiff } {
    return {
        dark: syntaxHighlightDecorations(diff, lang, 'dark'),
        light: syntaxHighlightDecorations(diff, lang, 'light'),
    }
}
