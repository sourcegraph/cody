export function typescriptKeywordSyntax(symbol: string): TypescriptKeyword | undefined {
    switch (symbol) {
        case 'scip-typescript npm typescript . array#':
            return TypescriptKeyword.List
        case 'scip-typescript npm typescript . null#':
            return TypescriptKeyword.Null
        case 'scip-typescript npm typescript . string#':
            return TypescriptKeyword.String
        case 'scip-typescript npm typescript . false#':
        case 'scip-typescript npm typescript . true#':
        case 'scip-typescript npm typescript . boolean#':
            return TypescriptKeyword.Boolean
        case 'scip-typescript npm typescript . number#':
            return TypescriptKeyword.Long
        case 'scip-typescript npm typescript . any#':
        case 'scip-typescript npm typescript . unknown#':
            return TypescriptKeyword.Object
        default:
            return undefined
    }
}

export enum TypescriptKeyword {
    List = 'List',
    Null = 'Null',
    String = 'String',
    Boolean = 'Boolean',
    Long = 'Long',
    Object = 'Object',
}

export function isBooleanTypeRef(symbol: string): boolean {
    switch (symbol) {
        case 'scip-typescript npm typescript . false#':
        case 'scip-typescript npm typescript . true#':
        case 'scip-typescript npm typescript . boolean#':
            return true
        default:
            return false
    }
}

export function capitalize(text: string): string {
    if (text.length === 0) {
        return text
    }
    return text[0].toUpperCase() + text.slice(1)
}

export function isTypescriptKeyword(symbol: string): boolean {
    return (
        typescriptKeywordSyntax(symbol) !== undefined &&
        symbol !== 'scip-typescript npm typescript . array#'
    )
}

export function typescriptKeyword(keyword: string): string {
    return `scip-typescript npm typescript . ${keyword}#`
}
