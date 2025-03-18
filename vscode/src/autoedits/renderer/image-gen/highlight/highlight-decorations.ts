import { syntaxHighlighter } from '.'
import type { SYNTAX_HIGHLIGHT_THEME } from './types'

import type { ThemedToken } from 'shiki/types.mjs'

import type { MultiLineSupportedLanguage } from '../../../../completions/detect-multiline'
import type { SyntaxHighlightRanges, VisualDiff } from '../visual-diff/types'
import { getCodeBlock } from '../visual-diff/utils'
import { DEFAULT_HIGHLIGHT_COLORS } from './constants'
import { SYNTAX_HIGHLIGHTING_LANGUAGES, SYNTAX_HIGHLIGHTING_THEMES } from './shiki'

interface GetHighlightTokensParams {
    diff: VisualDiff
    lang: string
    theme: SYNTAX_HIGHLIGHT_THEME
    /**
     * The actual code we care about. We need to highlight incoming and original code
     * separately to ensure we get the correct highlighting for each side.
     */
    type: 'original' | 'incoming'
}

function getHighlightTokens({
    diff,
    lang,
    theme,
    type,
}: GetHighlightTokensParams): Map<number, ThemedToken[]> {
    if (!syntaxHighlighter) {
        throw new Error('Syntax highlighter not initialized')
    }

    const highlightLang = SYNTAX_HIGHLIGHTING_LANGUAGES[lang as MultiLineSupportedLanguage]?.name
    if (!highlightLang) {
        return new Map()
    }

    const codeBlock = getCodeBlock(diff, type)
    if (!codeBlock) {
        return new Map()
    }

    const { tokens } = syntaxHighlighter.codeToTokens(codeBlock.code, {
        theme: SYNTAX_HIGHLIGHTING_THEMES[theme].name,
        lang: highlightLang,
    })

    const result = new Map<number, ThemedToken[]>()
    for (let i = 0; i < tokens.length; i++) {
        const lineTokens = tokens[i]
        result.set(i + codeBlock.startLine, lineTokens)
    }

    return result
}

function getHighlightsForLine(
    lineTokens: ThemedToken[],
    theme: SYNTAX_HIGHLIGHT_THEME
): SyntaxHighlightRanges[] {
    const syntaxHighlights: SyntaxHighlightRanges[] = []
    let currentPosition = 0
    for (const token of lineTokens) {
        const tokenLength = token.content.length
        const startPos = currentPosition
        const endPos = currentPosition + tokenLength
        syntaxHighlights.push({
            range: [startPos, endPos],
            color: token.color || DEFAULT_HIGHLIGHT_COLORS[theme],
        })
        currentPosition += tokenLength
    }
    return syntaxHighlights
}

/**
 * Given a list of added lines, rebuild the code snippet and apply syntax highlighting to it.
 * Highlighting colors and themes are provided by Shiki.
 * Ideally we could re-use the same syntax highlighting from the users' editor, but this is unfortunately not possible - at least in VS Code.
 * See: https://github.com/microsoft/vscode/issues/32813
 */
export function syntaxHighlightDecorations(
    diff: VisualDiff,
    lang: string,
    theme: SYNTAX_HIGHLIGHT_THEME
): VisualDiff {
    const incomingHighlights = getHighlightTokens({
        diff,
        lang,
        theme,
        type: 'incoming',
    })

    // We only care about originalHighlights for unified diffs
    let originalHighlights: Map<number, ThemedToken[]> | undefined
    if (diff.mode === 'unified') {
        originalHighlights = getHighlightTokens({
            diff,
            lang,
            theme,
            type: 'original',
        })
    }

    const lines = diff.lines.map(line => {
        const lineTokens =
            line.type === 'removed' || line.type === 'modified-removed'
                ? originalHighlights?.get(line.originalLineNumber)
                : incomingHighlights.get(line.modifiedLineNumber)
        if (lineTokens) {
            line.syntaxHighlights[theme] = getHighlightsForLine(lineTokens, theme)
        }
        return line
    })

    return { mode: diff.mode, lines }
}
