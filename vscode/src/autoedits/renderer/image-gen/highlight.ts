import type { BundledLanguage, HighlighterGeneric } from 'shiki/types.mjs'
import * as vscode from 'vscode'

import type { MultiLineSupportedLanguage } from '../../../completions/detect-multiline'
import { AddedLineInfo, ModifiedLineInfo, UnchangedLineInfo } from '../decorators/base'
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
    sortedDiff: (AddedLineInfo | ModifiedLineInfo | UnchangedLineInfo)[],
    lang: string,
    mode: SYNTAX_HIGHLIGHT_MODE
): { range: vscode.Range; color: string; text: string }[] {
    if (!syntaxHighlighter) {
        throw new Error('Syntax highlighter not initialized')
    }

    const highlightLang = SYNTAX_HIGHLIGHTING_LANGUAGES[lang as MultiLineSupportedLanguage]?.name
    if (!highlightLang) {
        return []
    }

    // Rebuild the codeblock from the diff
    const code = sortedDiff
        .map(line => {
            if ('modifiedText' in line) return line.modifiedText
            if ('text' in line) return line.text
            return ''
        })
        .join('\n')

    const { tokens } = syntaxHighlighter.codeToTokens(code, {
        theme: SYNTAX_HIGHLIGHTING_THEMES[mode].name,
        lang: highlightLang,
    })

    const defaultColour = mode === 'dark' ? '#ffffff' : '#000000'
    const syntaxHighlighting: { range: vscode.Range; color: string; text: string }[] = []

    // Process each line's tokens
    tokens.forEach((lineTokens, lineIndex) => {
        let currentPosition = 0
        for (const token of lineTokens) {
            const tokenLength = token.content.length

            syntaxHighlighting.push({
                range: new vscode.Range(
                    lineIndex,
                    currentPosition,
                    lineIndex,
                    currentPosition + tokenLength
                ),
                color: token.color || defaultColour,
                text: token.content,
            })

            currentPosition += tokenLength
        }
    })

    return syntaxHighlighting
}
