import { JvmLanguage } from './JvmCodegen'

export function typescriptKeywordSyntax(language: JvmLanguage, symbol: string): string | undefined {
    switch (symbol) {
        case 'scip-typescript npm typescript . array#':
            return 'List'
        case 'scip-typescript npm typescript . null#':
            return language === JvmLanguage.Kotlin ? 'Null' : 'Void'
        case 'scip-typescript npm typescript . string#':
            return 'String'
        case 'scip-typescript npm typescript . false#':
        case 'scip-typescript npm typescript . true#':
        case 'scip-typescript npm typescript . boolean#':
            return 'Boolean'
        case 'scip-typescript npm typescript . number#':
            return 'Long'
        case 'scip-typescript npm typescript . any#':
        case 'scip-typescript npm typescript . unknown#':
            return language === JvmLanguage.Kotlin ? 'Any' : 'Object'
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

export function isTypescriptKeyword(language: JvmLanguage, symbol: string): boolean {
    return (
        typescriptKeywordSyntax(language, symbol) !== undefined &&
        symbol !== 'scip-typescript npm typescript . array#'
    )
}

export function typescriptKeyword(keyword: string): string {
    return `scip-typescript npm typescript . ${keyword}#`
}
