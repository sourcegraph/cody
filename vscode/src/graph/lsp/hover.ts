import type * as vscode from 'vscode'

import { lines } from '../../completions/text-processing'

export function extractHoverContent(hover: vscode.Hover[]): ParsedHover[] {
    return (
        hover
            .flatMap(hover => hover.contents.map(c => (typeof c === 'string' ? c : c.value)))
            .map(extractMarkdownCodeBlock)
            .map(
                s => s.trim()
                // TODO: handle loading states
                // .replace('(loading...) ', '')
                // TODO: adapt to other languages
                // .replace('(method)', 'function')
                // .replace('constructor', 'function')
                // .replace(/^\(\w+\) /, '')
            )
            .filter(s => s !== '')
            // Remove the last line if it's an import statement prefix
            .map(s => {
                const hoverLines = lines(s)
                if (hoverLines.length > 1 && hoverLines.at(-1)?.startsWith('import')) {
                    return hoverLines.slice(0, -1).join('\n')
                }
                return s
            })
            .map(s => parseHoverString(s))
    )
}

interface ParsedHover {
    kind: string | undefined
    text: string
}

const HOVER_STRING_REGEX = /^\(([^)]+)\)\s([\s\S]+)$|^([\s\S]+)$/m
function parseHoverString(hoverString: string): ParsedHover {
    const match = hoverString.match(HOVER_STRING_REGEX)

    if (match) {
        return {
            kind: match[1] || undefined,
            text: match[2] || match[3],
        }
    }

    throw new Error(`Unexpected hover string format: ${hoverString}`)
}

function extractMarkdownCodeBlock(string: string): string {
    const lines = string.split('\n')
    const codeBlocks: string[] = []
    let isCodeBlock = false

    for (const line of lines) {
        const isCodeBlockDelimiter = line.trim().startsWith('```')

        if (isCodeBlockDelimiter && !isCodeBlock) {
            isCodeBlock = true
        } else if (isCodeBlockDelimiter && isCodeBlock) {
            isCodeBlock = false
        } else if (isCodeBlock) {
            codeBlocks.push(line)
        }
    }

    return codeBlocks.join('\n')
}

export function isUnhelpfulSymbolSnippet(symbolName: string, symbolSnippet: string): boolean {
    const trimmed = symbolSnippet.trim()
    return (
        symbolSnippet === '' ||
        symbolSnippet === symbolName ||
        (!symbolSnippet.includes(symbolName) && !symbolSnippet.includes('constructor')) ||
        trimmed === `interface ${symbolName}` ||
        trimmed === `enum ${symbolName}` ||
        trimmed === `class ${symbolName}` ||
        trimmed === `type ${symbolName}`
    )
}
