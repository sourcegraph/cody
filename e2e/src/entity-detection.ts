export interface DetectedEntity {
    type: 'symbol' | 'path'
    value: string
}

export function detectEntities(text: string): DetectedEntity[] {
    return detectSymbols(text).concat(detectFilePaths(text))
}

export function detectSymbols(text: string): DetectedEntity[] {
    return deduplicate(
        tokenize(removeCodeBlocks(text))
            .filter(lengthAtLeast(3))
            .filter(not(isFilePath))
            .filter(isSymbol)
            .map(removeInlineCodeBlockDelimiters)
            .flatMap(splitNamespace)
            .map(token => ({ value: token, type: 'symbol' }))
    )
}

function isSymbol(token: string): boolean {
    const isInlineMarkdownCodeBlock = token.startsWith('`') && token.endsWith('`')
    if (isInlineMarkdownCodeBlock) {
        token = token.slice(1, -1)
    } else {
        // Only consider symbols wrapped in an inline code block.
        return false
    }

    if (token.startsWith('-')) {
        // Probably a CLI flag.
        return false
    }

    if (token === token.toUpperCase()) {
        // Probably a constant.
        return true
    }

    const numUnderscores = token.split('_').length - 1
    if (numUnderscores > 0) {
        return true
    }

    if (isMixedCase(token)) {
        return true
    }

    return false
}

function splitNamespace(token: string): string[] {
    return token
        .split(/\.|::/)
        .map(token => token.trim())
        .filter(lengthAtLeast(1))
}

function isMixedCase(token: string): boolean {
    return token !== token.toLowerCase() && token !== token.toUpperCase()
}

export function detectFilePaths(text: string): DetectedEntity[] {
    return deduplicate(
        tokenize(removeCodeBlocks(text))
            .filter(lengthAtLeast(3))
            .filter(isFilePath)
            .map(removeInlineCodeBlockDelimiters)
            .map(token => ({ value: token, type: 'path' }))
    )
}

function isFilePath(token: string): boolean {
    const isInlineMarkdownCodeBlock = token.startsWith('`') && token.endsWith('`')
    if (isInlineMarkdownCodeBlock) {
        token = token.slice(1, -1)
    }

    if (token.startsWith('/')) {
        // Probably an HTTP path, e.g., /api/.graphql
        return false
    }

    const parts = token.split('/')
    if (parts.length === 1) {
        const dotSplit = parts[0].split('.')
        // Probably a file name with an extension, e.g. `dataset.py`.
        return isInlineMarkdownCodeBlock && dotSplit.length === 2 && dotSplit[1].length <= 4
    }
    if (parts[0].includes('.com')) {
        // Probably a repository path, e.g., github.com/sourcegraph/sourcegraph.
        return false
    }

    const lastPart = parts[parts.length - 1]
    // Consider token a file path if it is wrapped in an inline markdown code block or has an extension.
    return isInlineMarkdownCodeBlock || lastPart.includes('.')
}

function removeInlineCodeBlockDelimiters(token: string): string {
    const isInlineMarkdownCodeBlock = token.startsWith('`') && token.endsWith('`')
    if (isInlineMarkdownCodeBlock) {
        return token.slice(1, -1)
    }
    return token
}

function not(fn: (token: string) => boolean): (token: string) => boolean {
    return (token: string) => !fn(token)
}

function lengthAtLeast(minLength: number) {
    return (token: string) => token.length >= minLength
}

const trailingPunctuation = new Set(['.', ',', '?', '!', '"', "'", ':', ';', ')', '}', ']'])
const leadingPunctuation = new Set(["'", '"', '(', '[', '{'])

function tokenize(text: string): string[] {
    return text
        .split(/\s/)
        .map(token => {
            token = token.trim()
            while (token.length > 0 && trailingPunctuation.has(token.slice(-1))) {
                token = token.slice(0, -1)
            }
            if (token.length === 0) {
                return token
            }

            const firstChar = token[0]
            if (leadingPunctuation.has(firstChar)) {
                token = token.slice(1)
            }
            return token
        })
        .filter(token => token.length > 0)
}

function deduplicate(entities: DetectedEntity[]): DetectedEntity[] {
    const seen = new Set<string>()
    const deduped: DetectedEntity[] = []

    for (const entity of entities) {
        if (seen.has(entity.value)) {
            continue
        }
        seen.add(entity.value)
        deduped.push(entity)
    }

    return deduped
}

export function removeCodeBlocks(text: string): string {
    const lines = text.split('\n')
    const result: string[] = []

    let isCodeBlock = false
    for (const line of lines) {
        const isCodeBlockDelimiter = line.trim().startsWith('```')
        if (isCodeBlockDelimiter && !isCodeBlock) {
            isCodeBlock = true
        } else if (isCodeBlockDelimiter && isCodeBlock) {
            isCodeBlock = false
            // Skip closing code block delimiter.
            continue
        }
        if (!isCodeBlock) {
            result.push(line)
        }
    }

    return result.join('\n')
}
