import type { ContextFile } from '../..'

/**
 * Verifies that the context files passed in the contextFilesMap are still referenced
 * in the provided input string, and returns only those context files.
 *
 * Also parses the input to extract line number ranges after any matching
 * file names, and sets the range property on the contextFile objects.
 *
 * @param input - The input string to check for file name references.
 * @param contextFilesMap - The map of file names to ContextFile objects.
 * @returns The ContextFile objects that are still referenced in the input.
 */
export function verifyContextFilesFromInput(
    input: string,
    contextFilesMap?: Map<string, ContextFile>
): ContextFile[] {
    if (!input.trim() || !contextFilesMap?.size) {
        return []
    }

    // Loops through the provided contextFilesMap and checks if the file name key
    // is still present in the input string. If so, adds the contextFile value to
    // the returned array. If not, skips it.
    const userContextFiles: ContextFile[] = []
    for (const [fileName, contextFile] of contextFilesMap) {
        if (!input.includes(fileName)) {
            continue
        }

        // Get the line number behind the file name if there is one.
        // Example: foo/bar.ts:1-2
        const lines = input.match(new RegExp(fileName + ':([0-9]+)-([0-9]+)'))

        // -1 because line number in editor starts with 1 (as input
        // by the user), but in selection range, it starts with 0.
        const startLine = parseInt(lines?.[1] || '1', 10) - 1
        const endLine = parseInt(lines?.[2] || '1', 10) - 1

        // Verify if the range is valid.
        if (endLine && endLine >= startLine) {
            contextFile.range = {
                start: { line: startLine, character: 0 },
                end: { line: endLine, character: 0 },
            }
        }

        userContextFiles.push(contextFile)
    }
    return userContextFiles
}
