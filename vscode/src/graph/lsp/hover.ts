import type * as vscode from 'vscode'

import { lines } from '../../completions/text-processing'

// TODO: adapt to other languages
export function extractHoverContent(hover: vscode.Hover[]): ParsedHover[] {
    const parsedHovers = hover
        .flatMap(hover => hover.contents.map(c => (typeof c === 'string' ? c : c.value)))
        .map(extractMarkdownCodeBlock)
        .map(
            s => s.trim()
            // TODO: handle loading states
            // .replace('(loading...) ', '')
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

    if (parsedHovers.length === 0) {
        return [
            {
                kind: undefined,
                text: '',
            },
        ]
    }

    return parsedHovers
}

export interface ParsedHover {
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

    console.error(`Unexpected hover string format: ${hoverString}`)
    return {
        kind: undefined,
        text: hoverString,
    }
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

export function isUnhelpfulSymbolSnippet(symbolName: string, symbolSnippet?: string): boolean {
    if (!symbolSnippet) {
        return true
    }

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
