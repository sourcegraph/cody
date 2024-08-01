import fastLevenshtein from 'fast-levenshtein'

export function fastFuzzyMatch(text: string, snippet: string): number | null {
    const lines = text.split('\n')
    const snippetLines = snippet.split('\n')
    const snippetLength = snippet.length

    let minDistance = Number.MAX_SAFE_INTEGER
    const maxAllowedDistance = Math.floor(snippetLength * 0.3) // 30% threshold

    for (let i = 0; i <= lines.length - snippetLines.length; i++) {
        const window = lines.slice(i, i + snippetLines.length).join('\n')

        // Early length check
        if (Math.abs(window.length - snippetLength) > maxAllowedDistance) {
            continue
        }

        const distance = fastLevenshtein.get(window, snippet)

        // Early exit if exact match found
        if (distance === 0) {
            return 0
        }

        // Update minimum distance
        if (distance < minDistance) {
            minDistance = distance

            // Early exit if good enough match found
            if (distance <= maxAllowedDistance) {
                break
            }
        }
    }

    return minDistance < Number.MAX_SAFE_INTEGER ? minDistance : null
}
