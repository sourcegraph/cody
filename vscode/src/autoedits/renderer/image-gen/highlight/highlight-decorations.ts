import { syntaxHighlighter } from '.'
import type { SYNTAX_HIGHLIGHT_THEME } from './types'

import type { ThemedToken } from 'shiki/types.mjs'

import type { MultiLineSupportedLanguage } from '../../../../completions/detect-multiline'
import type { SyntaxHighlightRanges, VisualDiff } from '../decorated-diff/types'
import { getCodeBlock } from '../decorated-diff/utils'
import { DEFAULT_HIGHLIGHT_COLORS } from './constants'
import { SYNTAX_HIGHLIGHTING_LANGUAGES, SYNTAX_HIGHLIGHTING_THEMES } from './shiki'

interface GetHighlightTokensParams {
    diff: VisualDiff
    lang: string
    theme: SYNTAX_HIGHLIGHT_THEME
    /**
     * The actual code we care about. We need to highlight incoming and outgoing code
     * separately to ensure we get the correct highlighting for each side.
     */
    type: 'incoming' | 'outgoing'
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

    const { code, startLine } = getCodeBlock(diff, type)
    console.log('got code', code)
    const { tokens } = syntaxHighlighter.codeToTokens(code, {
        theme: SYNTAX_HIGHLIGHTING_THEMES[theme].name,
        lang: highlightLang,
    })

    const result = new Map<number, ThemedToken[]>()
    for (let i = 0; i < tokens.length; i++) {
        const lineTokens = tokens[i]
        result.set(i + startLine, lineTokens)
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
    const mode = diff.type

    const incomingHighlights = getHighlightTokens({
        diff,
        lang,
        theme,
        type: 'incoming',
    })

    // We only care about outgoingHighlights for unified diffs
    let outgoingHighlights: Map<number, ThemedToken[]> | undefined
    if (diff.type === 'unified') {
        outgoingHighlights = getHighlightTokens({
            diff,
            lang,
            theme,
            type: 'outgoing',
        })
    }

    const lines = diff.lines.map(line => {
        if (line.type === 'removed' || line.type === 'modified-removed') {
            const lineTokens = outgoingHighlights?.get(line.originalLineNumber)
            if (lineTokens) {
                line.syntaxHighlights[theme] = getHighlightsForLine(lineTokens, theme)
            }
            return line
        }

        const lineTokens = incomingHighlights.get(line.modifiedLineNumber)
        if (lineTokens) {
            if ('syntaxHighlights' in line) {
                line.syntaxHighlights[theme] = getHighlightsForLine(lineTokens, theme)
            } else {
                line.newSyntaxHighlights[theme] = getHighlightsForLine(lineTokens, theme)
            }
        }
        return line
    })

    return { type: mode, lines }
}
