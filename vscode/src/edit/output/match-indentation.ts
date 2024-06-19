import type * as vscode from 'vscode'

export function getIndentationCharacter(text: string): ' ' | '\t' {
    const lines = text.split('\n')
    for (const line of lines) {
        const firstChar = line[0]
        if (firstChar !== '\t' && firstChar !== ' ') {
            // Did not find a matching indentation character, keep looking
            continue
        }
        return firstChar
    }

    // Default to whitespace
    return ' '
}

export function matchIndentation(
    incoming: string,
    original: string,
    startPosition: vscode.Position
): string {
    const startIndex = startPosition.character
    const originalIndentationLength = original.length - original.trimStart().length + startIndex
    const incomingIndentationLength = incoming.length - incoming.trimStart().length
    const indentationAdjustment = originalIndentationLength - incomingIndentationLength

    const originalIndentationCharacter = getIndentationCharacter(original)
    const incomingIndentationCharacter = getIndentationCharacter(incoming)

    if (!indentationAdjustment && originalIndentationCharacter === incomingIndentationCharacter) {
        return incoming
    }

    const result = incoming
        .split('\n')
        .map(line => {
            const trimmedLine = line.trimStart()
            const indentationLength = line.length - trimmedLine.length
            const adjustedIndentationLength = Math.max(indentationLength + indentationAdjustment, 0)
            return originalIndentationCharacter.repeat(adjustedIndentationLength) + trimmedLine
        })
        .join('\n')
    return result
}
