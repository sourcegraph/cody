// Computes a derivation of the updated text that attempts to fix indentation by
// looking at the differences between the current and original text.
export function fixIndentation(current: string, original: string, updated: string): string {
    const currentMinIndentation = minIndentation(current)
    const originalMinIndentation = minIndentation(original)
    const updatedMinIndentation = minIndentation(updated)

    // Only do work if the original has the same min indentation as the updated text
    // and the current one has a larger one.
    if (originalMinIndentation !== updatedMinIndentation) {
        return updated
    }
    if (currentMinIndentation.length <= updatedMinIndentation.length) {
        return updated
    }

    const difference = currentMinIndentation.slice(updatedMinIndentation.length)

    return applyIndentation(updated, difference)
}

// Returns the shortest whitespace prefix of all lines in the given text.
// TODO: make it work even if \t and spaces are interleaved.
function minIndentation(text: string): string {
    const lines = text.split('\n')
    let min: string | null = null
    for (const line of lines) {
        const match = line.match(/^[\t ]*/)
        if (!match) {
            continue
        }

        if (min === null) {
            min = match[0]
            continue
        }
        if (match[0].length < min.length) {
            min = match[0]
        }
    }
    return min ?? ''
}

function applyIndentation(text: string, indentation: string): string {
    const lines = text.split('\n')
    return lines.map(line => indentation + line).join('\n')
}
