import levenshtein from 'js-levenshtein'
import * as vscode from 'vscode'

// TODO(philipp-spiess): Correct for invalid indentations right away to ensure we
// find the location with the best overlap.
export function fuzzyFindLocation(
    document: vscode.TextDocument,
    snippet: string
): { location: vscode.Location; distance: number } | null {
    const lines = document.getText().split('\n')
    const snippetLines = snippet.split('\n')

    const candidates: [number, number][] = []
    for (let i = 0; i <= lines.length - snippetLines.length; i++) {
        const window = lines.slice(i, i + snippetLines.length).join('\n')
        const distance = levenshtein(window, snippet)
        candidates.push([distance, i])
    }

    const sortedCandidates = candidates.sort((a, b) => a[0] - b[0])
    if (sortedCandidates.length === 0) {
        return null
    }
    const [distance, index] = sortedCandidates[0]

    const startLine = index
    const endLine = index + snippetLines.length - 1
    const start = new vscode.Position(startLine, 0)
    const end = new vscode.Position(endLine, lines[endLine].length)

    return { location: new vscode.Location(document.uri, new vscode.Range(start, end)), distance }
}
