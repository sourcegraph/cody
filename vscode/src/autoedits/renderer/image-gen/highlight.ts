import type { BundledLanguage, HighlighterGeneric, ThemedToken } from 'shiki/types.mjs'

import type { ModifiedLineInfoAdded, ModifiedLineInfoRemoved, VisualDiff, VisualDiffLine } from '.'
import type { MultiLineSupportedLanguage } from '../../../completions/detect-multiline'
import type { AddedLineInfo, RemovedLineInfo } from '../decorators/base'
import { SYNTAX_HIGHLIGHTING_LANGUAGES, SYNTAX_HIGHLIGHTING_THEMES, getShiki } from './shiki'

let syntaxHighlighter: HighlighterGeneric<BundledLanguage, string> | null = null

export type SYNTAX_HIGHLIGHT_MODE = 'light' | 'dark'

export async function initSyntaxHighlighter(): Promise<void> {
    if (!syntaxHighlighter) {
        syntaxHighlighter = await getShiki()
    }
}

function getHighlightTokens(
    code: string,
    lang: string,
    mode: SYNTAX_HIGHLIGHT_MODE,
    offset: number
): Map<number, ThemedToken[]> {
    if (!syntaxHighlighter) {
        throw new Error('Syntax highlighter not initialized')
    }

    const highlightLang = SYNTAX_HIGHLIGHTING_LANGUAGES[lang as MultiLineSupportedLanguage]?.name
    if (!highlightLang) {
        return new Map()
    }

    const { tokens } = syntaxHighlighter.codeToTokens(code, {
        theme: SYNTAX_HIGHLIGHTING_THEMES[mode].name,
        lang: highlightLang,
    })

    const result = new Map<number, ThemedToken[]>()
    for (let i = 0; i < tokens.length; i++) {
        const lineTokens = tokens[i]
        result.set(i + offset, lineTokens)
    }

    return result
}

export const DEFAULT_HIGHLIGHT_COLORS: Record<SYNTAX_HIGHLIGHT_MODE, string> = {
    dark: '#ffffff',
    light: '#000000',
}

function processTokens(
    lineTokens: ThemedToken[],
    highlights: { range: [number, number]; color: string }[],
    mode: SYNTAX_HIGHLIGHT_MODE
): void {
    let currentPosition = 0
    for (const token of lineTokens) {
        const tokenLength = token.content.length
        const startPos = currentPosition
        const endPos = currentPosition + tokenLength
        highlights.push({
            range: [startPos, endPos],
            color: token.color || DEFAULT_HIGHLIGHT_COLORS[mode],
        })
        currentPosition += tokenLength
    }
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
    mode: SYNTAX_HIGHLIGHT_MODE
): VisualDiff {
    // Rebuild the codeblocks
    const suggestedLines = diff.lines.filter(
        (line): line is Exclude<VisualDiffLine, RemovedLineInfo | ModifiedLineInfoRemoved> =>
            ['added', 'modified', 'modified-added', 'unchanged'].includes(line.type)
    )
    const previousLines = diff.lines.filter(
        (line): line is Exclude<VisualDiffLine, AddedLineInfo | ModifiedLineInfoAdded> =>
            ['removed', 'modified', 'modified-removed', 'unchanged'].includes(line.type)
    )

    const suggestedCode = suggestedLines
        .map(line => ('newText' in line ? line.newText : line.text))
        .join('\n')
    const previousCode = previousLines
        .map(line => ('oldText' in line ? line.oldText : line.text))
        .join('\n')

    const suggestedHighlights = getHighlightTokens(
        suggestedCode,
        lang,
        mode,
        suggestedLines[0].modifiedLineNumber
    )
    const previousHighlights = getHighlightTokens(
        previousCode,
        lang,
        mode,
        previousLines[0].originalLineNumber
    )

    const lines = diff.lines.map(line => {
        if (line.type === 'removed' || line.type === 'modified-removed') {
            // We have to handle removals separately. This is because the removed code may have different highlighting to
            // the added code. We need to apply the same highlighting to the removed code as the added code.
            const lineTokens = previousHighlights.get(line.originalLineNumber)
            if (lineTokens) {
                processTokens(lineTokens, line.highlights[mode], mode)
            }
            return line
        }

        const lineTokens = suggestedHighlights.get(line.modifiedLineNumber)
        if (lineTokens) {
            // We have already handle any deletions above, so we always use incoming highlights where possible
            const highlights = 'newHighlights' in line ? line.newHighlights : line.highlights
            processTokens(lineTokens, highlights[mode], mode)
        }
        return line
    })

    return { lines }
}
