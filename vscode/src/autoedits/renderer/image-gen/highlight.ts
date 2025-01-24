import type { BundledLanguage, HighlighterGeneric } from 'shiki/types.mjs'

import type { MultiLineSupportedLanguage } from '../../../completions/detect-multiline'
import type { AddedLinesDecorationInfo } from '../decorators/default-decorator'
import { SYNTAX_HIGHLIGHTING_LANGUAGES, SYNTAX_HIGHLIGHTING_THEMES, getShiki } from './shiki'

let syntaxHighlighter: HighlighterGeneric<BundledLanguage, string> | null = null

export type SYNTAX_HIGHLIGHT_MODE = 'light' | 'dark'

export async function initSyntaxHighlighter(): Promise<void> {
    if (!syntaxHighlighter) {
        syntaxHighlighter = await getShiki()
    }
}

/**
 * Given a list of added lines, rebuild the code snippet and apply syntax highlighting to it.
 * Highlighting colors and themes are provided by Shiki.
 * Ideally we could re-use the same syntax highlighting from the users' editor, but this is unfortunately not possible - at least in VS Code.
 * See: https://github.com/microsoft/vscode/issues/32813
 */
export function syntaxHighlightDecorations(
    decorations: AddedLinesDecorationInfo[],
    lang: string,
    mode: SYNTAX_HIGHLIGHT_MODE
): AddedLinesDecorationInfo[] {
    if (!syntaxHighlighter) {
        throw new Error('Syntax highlighter not initialized')
    }

    const highlightLang = SYNTAX_HIGHLIGHTING_LANGUAGES[lang as MultiLineSupportedLanguage]?.name
    if (!highlightLang) {
        // We have tried to highlight this language, but it is not supported.
        // Return unhighlighted decorations, we can still render the diff decorations.
        return decorations
    }

    // Rebuild the codeblock ready for it to be highlighted
    const code = decorations.map(({ lineText }) => lineText).join('\n')

    const { tokens } = syntaxHighlighter.codeToTokens(code, {
        theme: SYNTAX_HIGHLIGHTING_THEMES[mode].name,
        lang: highlightLang,
    })

    // It is not guaranteed we will have a color to paint the text, so we differentiate between
    // white or black text depending on the theme
    const defaultColour = mode === 'dark' ? '#ffffff' : '#000000'

    // Process each line's tokens and merge them into highlightedRanges
    return decorations.map((decoration, lineIndex) => {
        const lineTokens = tokens[lineIndex] || []
        const newHighlightedRanges: AddedLinesDecorationInfo['highlightedRanges'] = [
            ...decoration.highlightedRanges,
        ]

        let currentPosition = 0
        for (const token of lineTokens) {
            const tokenLength = token.content.length
            const startPos = currentPosition
            const endPos = currentPosition + tokenLength

            newHighlightedRanges.push({
                type: 'syntax-highlighted',
                range: [startPos, endPos],
                color: token.color || defaultColour,
            })
            currentPosition += tokenLength
        }

        // Sort merged ranges by start position
        newHighlightedRanges.sort((a, b) => a.range[0] - b.range[0])

        return {
            ...decoration,
            highlightedRanges: newHighlightedRanges,
        }
    })
}
