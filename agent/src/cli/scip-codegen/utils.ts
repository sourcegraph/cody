export function typescriptKeywordSyntax(symbol: string): string | undefined {
    switch (symbol) {
        case 'scip-typescript npm typescript . array#':
            return 'List'
        case 'scip-typescript npm typescript . null#':
            return 'Null'
        case 'scip-typescript npm typescript . string#':
            return 'String'
        case 'scip-typescript npm typescript . false#':
        case 'scip-typescript npm typescript . true#':
        case 'scip-typescript npm typescript . boolean#':
            return 'Boolean'
        case 'scip-typescript npm typescript . number#':
            return 'Int'
        case 'scip-typescript npm typescript . any#':
            return 'Any'
        default:
            return undefined
    }
}

export function capitalize(text: string): string {
    if (text.length === 0) {
        return text
    }
    return text[0].toUpperCase() + text.slice(1)
}

export function isTypescriptKeyword(symbol: string): boolean {
    return typescriptKeywordSyntax(symbol) !== undefined
}

export function typescriptKeyword(keyword: string): string {
    return `scip-typescript npm typescript . ${keyword}#`
}
