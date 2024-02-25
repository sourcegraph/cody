import type { ContextItem } from '../..'

/**
 * Verifies that the context files passed in the contextFilesMap are still referenced
 * in the provided input string, and returns only those context files with specificed ranges.
 *
 * It parses the input to extract line number ranges after any matching
 * file names, and sets the range property on the contextFile objects.
 *
 * @param input - The input string to check for file name references.
 * @param contextFilesMap - The map of file names to ContextFile objects.
 * @returns The ContextFile objects that are still referenced in the input.
 */
export function verifyContextFilesFromInput(
    inputValue: string,
    contextFilesMap?: Map<string, ContextItem>
): ContextItem[] {
    if (!inputValue.trim() || !contextFilesMap?.size) {
        return []
    }

    // Loops through the provided contextFilesMap and checks if the file name key
    // is still present in the input string.
    // If so, create a new contextFile and add it to the returned array based on
    // presented strings that matches the @file-name with correct range.
    const userContextFiles: ContextItem[] = []
    for (const [fileName, contextFile] of contextFilesMap) {
        if (!inputValue.includes(fileName)) {
            continue
        }

        // Support windows paths
        const input = inputValue.replace(/\\/g, '/')
        const atFileName = fileName.replace(/\\/g, '/')

        // Add fileName in input that is not followed by a colon
        const counts = input.matchAll(new RegExp(atFileName + '(?!:)', 'g'))
        for (const _count of [...Array.from(counts)]) {
            const contextFileMatch = { ...contextFile, range: undefined }
            userContextFiles.push(contextFileMatch)
        }

        // Get the line number behind the file name if there is one:
        // SingleLines Example: foo/bar.ts:1 > 1
        const singleLines = input.matchAll(new RegExp(atFileName + ':(\\d+)(?!-)', 'g'))
        // MultiLines example: foo/bar.ts:1-2 > 1, 2
        const multiLines = input.matchAll(new RegExp(atFileName + ':(\\d+)-(\\d+)', 'g'))
        // loop all matches and set the range property on the contextFile object
        for (const match of [...Array.from(singleLines), ...Array.from(multiLines)]) {
            const contextFileMatch = { ...contextFile }
            const startLine = match[1]
            const endLine = match[2] ?? startLine
            // -1 because line number in editor starts with 1 (as input
            // by the user), but in selection range, it starts with 0.
            const startLineNum = parseInt(startLine, 10) - 1
            const endLineNum = parseInt(endLine, 10) - 1

            // Verify if endLineNum is greater or equal to start line
            if (endLineNum >= startLineNum) {
                contextFileMatch.range = {
                    start: { line: startLineNum, character: 0 },
                    end: { line: endLineNum, character: 0 },
                }
                userContextFiles.push(contextFileMatch)
            }
        }
    }

    return userContextFiles
}
