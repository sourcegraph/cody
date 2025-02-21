import * as vscode from 'vscode'

/**
 * Finds the range of a code block in a document, handling different languages.
 * @param doc The VS Code text document to search in
 * @param target Either a line number or a string to search for
 * @returns A VS Code range representing the code block, or undefined if not found
 */
export function findCodeBlockRangeUniversal(
    doc: vscode.TextDocument,
    target: number | string
): vscode.Range | undefined {
    const languageId = doc.languageId

    if (languageId === 'python') {
        return findPythonBlockRange(doc, target)
    }
    // Default to brace-based block detection for other languages
    return findCodeBlockRange(doc, target)
}

/**
 * Finds the range of a code block in a document based on indentation and braces.
 * Suitable for languages like TypeScript, Java, Go, etc.
 * @param doc The VS Code text document to search in
 * @param target Either a line number or a string to search for
 * @returns A VS Code range representing the code block, or undefined if not found
 */
export function findCodeBlockRange(
    doc: vscode.TextDocument,
    target: number | string
): vscode.Range | undefined {
    const lines = doc.getText().split('\n')

    // Handle empty document case
    if (!lines.length || (lines.length === 1 && lines[0].length === 0)) {
        return undefined
    }

    // Find the starting line
    const start = typeof target === 'number' ? target : lines.findIndex(ln => ln.includes(target))

    if (start === -1 || start >= lines.length) {
        return undefined
    }

    const baseIndent = getIndentation(lines[start])
    let end = start

    // Track opening and closing braces
    let braceCount = (lines[start].match(/{/g) || []).length - (lines[start].match(/}/g) || []).length

    // Search subsequent lines
    for (let i = start + 1; i < lines.length; i++) {
        const curr = lines[i]
        const currIndent = getIndentation(curr)

        // Update brace count
        braceCount += (curr.match(/{/g) || []).length - (curr.match(/}/g) || []).length

        // If we're at base indentation and braces are balanced, we can stop
        if (currIndent <= baseIndent && braceCount <= 0) {
            end = i
            break
        }

        end = i
    }

    return new vscode.Range(new vscode.Position(start, 0), new vscode.Position(end, lines[end].length))
}

/**
 * Finds the range of a Python code block in a document based on indentation.
 * @param doc The VS Code text document to search in
 * @param target Either a line number or a string to search for
 * @returns A VS Code range representing the Python code block, or undefined if not found
 */
export function findPythonBlockRange(
    doc: vscode.TextDocument,
    target: number | string
): vscode.Range | undefined {
    const lines = doc.getText().split('\n')

    if (!lines.length || (lines.length === 1 && lines[0].length === 0)) {
        return undefined
    }

    // Find starting line
    const start = typeof target === 'number' ? target : lines.findIndex(ln => ln.includes(target))
    if (start === -1 || start >= lines.length) {
        return undefined
    }

    const baseIndent = getIndentation(lines[start])
    let end = start

    // Python block detection logic
    for (let i = start + 1; i < lines.length; i++) {
        const curr = lines[i].trimRight() // Remove trailing whitespace but keep leading
        const currIndent = getIndentation(curr)

        // Handle empty lines
        if (curr.trim().length === 0) {
            // Look ahead to next non-empty line
            let nextNonEmptyIndex = i + 1
            while (nextNonEmptyIndex < lines.length && !lines[nextNonEmptyIndex].trim()) {
                nextNonEmptyIndex++
            }

            // Check if next non-empty line continues the block
            if (nextNonEmptyIndex < lines.length) {
                const nextIndent = getIndentation(lines[nextNonEmptyIndex])
                if (nextIndent <= baseIndent) {
                    // Block ends at last non-empty line, do not update end, just break
                    break
                }
                end = i // Block continues after empty line
                continue
            }
            // Reached end of document after empty line, block ends here
            break
        }

        // Handle special Python block starters
        const isBlockStarter = curr.trim().endsWith(':')
        if (isBlockStarter && i === start) {
            continue
        }

        // Check indentation level
        if (currIndent <= baseIndent && i !== start) {
            break
        }

        end = i
    }

    return new vscode.Range(new vscode.Position(start, 0), new vscode.Position(end, lines[end].length))
}

/**
 * Calculates the indentation level of a string by counting leading spaces and tabs
 * @param str The string to analyze
 * @returns The number of leading whitespace characters
 */
function getIndentation(str: string): number {
    let indent = 0
    for (let i = 0; i < str.length; i++) {
        if (str[i] === ' ' || str[i] === '\t') {
            indent++
        } else {
            break
        }
    }
    return indent
}
