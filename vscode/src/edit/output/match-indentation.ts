type IndentationCharacter = ' ' | '\t'
export function getIndentationCharacter(text: string): IndentationCharacter {
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

export function fixFirstLineIndentation(
    incoming: string,
    original: string,
    indentationCharacter: IndentationCharacter
): string {
    const originalFirstLineIndent = original.length - original.trimStart().length
    const incomingFirstLineIndent = incoming.length - incoming.trimStart().length
    if (originalFirstLineIndent === incomingFirstLineIndent) {
        // First line indentation was the same, so let's assume we got this mostly right
        return incoming
    }
    return indentationCharacter.repeat(originalFirstLineIndent) + incoming.trimStart()
}

export function getIndentationLevels(
    text: string,
    indentationCharacter: IndentationCharacter
): number[] {
    const lines = text.split('\n')
    const indentationLevels = new Set<number>()
    for (const line of lines) {
        const trimmedLine = line.trimStart()
        if (trimmedLine.length === 0) {
            // empty line, do nothing
            continue
        }
        const lineIndent = line.length - trimmedLine.length
        indentationLevels.add(lineIndent)
    }

    const sortedLevels = [...indentationLevels].sort((a, b) => a - b)
    if (indentationCharacter === '\t') {
        return sortedLevels
    }

    // If we are using spaces, we need to distinguish between indentation spaces
    // and spaces used for presentation (e.g. as part of a multi-line comment)
    // The simplest way to do this is to return indentation levels that are divisible by 2.
    return sortedLevels.filter(level => level % 2 === 0)
}

function findClosestIndex(arr: number[], target: number): number {
    let closestIndex = -1
    let closestDistance = Number.MAX_SAFE_INTEGER

    for (let i = 0; i < arr.length; i++) {
        const distance = target - arr[i]
        if (distance >= 0 && distance < closestDistance) {
            closestDistance = distance
            closestIndex = i
        }
    }

    return closestIndex
}

export function matchIndentation(incoming: string, original: string): string {
    const indentationCharacter = getIndentationCharacter(incoming)
    // LLMs will commonly get the first line indentation wrong, so fix this first.
    const updatedIncoming = fixFirstLineIndentation(incoming, original, indentationCharacter)

    // Get the indentation levels of the incoming text
    const incomingIndentationLevels = getIndentationLevels(updatedIncoming, indentationCharacter)
    const originalIndentationLevels = getIndentationLevels(original, indentationCharacter)

    const result = updatedIncoming
        .split('\n')
        .map((line, i) => {
            if (i === 0) {
                // Skip the first line, we already adjusted that to match the original
                return line
            }

            const trimmedLine = line.trimStart()
            if (trimmedLine.length === 0) {
                // empty line, do nothing
                return line
            }
            const lineIndentation = line.length - trimmedLine.length
            const indentationLevel = findClosestIndex(incomingIndentationLevels, lineIndentation)
            const updatedIndentationLevel = originalIndentationLevels[indentationLevel]
            return indentationCharacter.repeat(updatedIndentationLevel) + trimmedLine
        })
        .join('\n')
    return result
}
