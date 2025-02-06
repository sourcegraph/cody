import type { BundledLanguage, HighlighterGeneric, ThemedToken } from 'shiki/types.mjs'

import type { DecoratedDiff } from '.'
import type { MultiLineSupportedLanguage } from '../../../completions/detect-multiline'
import type { AddedLineInfo, DecorationLineInfo, RemovedLineInfo } from '../decorators/base'
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

/**
 * Given a list of added lines, rebuild the code snippet and apply syntax highlighting to it.
 * Highlighting colors and themes are provided by Shiki.
 * Ideally we could re-use the same syntax highlighting from the users' editor, but this is unfortunately not possible - at least in VS Code.
 * See: https://github.com/microsoft/vscode/issues/32813
 */
export function syntaxHighlightDecorations(
    diff: DecoratedDiff,
    lang: string,
    mode: SYNTAX_HIGHLIGHT_MODE
): DecoratedDiff {
    const defaultColour = mode === 'dark' ? '#ffffff' : '#000000'

    // Rebuild the codeblock
    const suggestedLines = diff.lines.filter(
        (line): line is Exclude<DecorationLineInfo, RemovedLineInfo> =>
            ['added', 'modified', 'unchanged'].includes(line.type)
    )
    const suggestedCode = suggestedLines
        .map(line => (line.type === 'modified' ? line.newText : line.text))
        .join('\n')

    const suggestedHighlights = getHighlightTokens(
        suggestedCode,
        lang,
        mode,
        suggestedLines[0].modifiedLineNumber
    )

    const previousLines = diff.lines.filter(
        (line: DecorationLineInfo): line is Exclude<DecorationLineInfo, AddedLineInfo> =>
            ['removed', 'modified', 'unchanged'].includes(line.type)
    )
    const previousCode = previousLines
        .map(line => (line.type === 'modified' ? line.oldText : line.text))
        .join('\n')
    const previousHighlights = getHighlightTokens(
        previousCode,
        lang,
        mode,
        previousLines[0].originalLineNumber
    )

    const lines = diff.lines.map(line => {
        if (line.type === 'removed') {
            const targetLine = line.originalLineNumber
            const lineTokens = previousHighlights.get(targetLine)
            if (!lineTokens) {
                return line
            }

            let currentPosition = 0
            for (const token of lineTokens) {
                const tokenLength = token.content.length
                const startPos = currentPosition
                const endPos = currentPosition + tokenLength
                line.highlights[mode].push({
                    range: [startPos, endPos],
                    color: token.color || defaultColour,
                })
                currentPosition += tokenLength
            }
            return line
        }

        if (line.type === 'modified') {
            const previousTargetLine = line.originalLineNumber
            const previousLineTokens = previousHighlights.get(previousTargetLine)
            if (!previousLineTokens) {
                return line
            }

            let currentPositionPrevious = 0
            for (const token of previousLineTokens) {
                const tokenLength = token.content.length
                const startPos = currentPositionPrevious
                const endPos = currentPositionPrevious + tokenLength
                line.oldHighlights[mode].push({
                    range: [startPos, endPos],
                    color: token.color || defaultColour,
                })
                currentPositionPrevious += tokenLength
            }

            const addedTargetLine = line.modifiedLineNumber
            const addedLineTokens = suggestedHighlights.get(addedTargetLine)
            if (!addedLineTokens) {
                return line
            }
            let currentPositionAdded = 0
            for (const token of addedLineTokens) {
                const tokenLength = token.content.length
                const startPos = currentPositionAdded
                const endPos = currentPositionAdded + tokenLength
                line.newHighlights[mode].push({
                    range: [startPos, endPos],
                    color: token.color || defaultColour,
                })
                currentPositionAdded += tokenLength
            }
            return line
        }

        const targetLine = line.modifiedLineNumber
        const lineTokens = suggestedHighlights.get(targetLine)
        if (!lineTokens) {
            return line
        }
        let currentPositionAdded = 0
        for (const token of lineTokens) {
            const tokenLength = token.content.length
            const startPos = currentPositionAdded
            const endPos = currentPositionAdded + tokenLength
            line.highlights[mode].push({
                range: [startPos, endPos],
                color: token.color || defaultColour,
            })
            currentPositionAdded += tokenLength
        }
        return line
    })

    return { lines }
}
