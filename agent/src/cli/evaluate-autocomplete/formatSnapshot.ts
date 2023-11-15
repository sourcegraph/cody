import { Input } from '@sourcegraph/scip-typescript/src/Input'
import { Range } from '@sourcegraph/scip-typescript/src/Range'
import * as scip from '@sourcegraph/scip-typescript/src/scip'

const lsiftyped = scip.scip

function commentSyntaxForLanguage(languageid: string): string {
    switch (languageid) {
        case 'haskell':
        case 'lua':
            return '--'
        case 'python':
        case 'ruby':
        case 'yaml':
        case 'dockerfile':
        case 'toml':
        case 'perl':
        case 'perl6':
            return '#'
        default:
            return '//'
    }
}

// This function is copy/pasted from the scip-typescript repository so that we
// can customize rendering for the `evaluate-autocomplete` command. For example,
// we will need to come up with a good solution for multi-line completions that may not
// be relevant for scip-typescript.
export function formatSnapshot(input: Input, document: scip.scip.Document): string {
    const commentSyntax = commentSyntaxForLanguage(document.language)
    const out: string[] = []
    document.occurrences.sort(occurrencesByLine)
    const symbolTable = new Map<string, scip.scip.SymbolInformation>()
    for (const symbolInfo of document.symbols) {
        symbolTable.set(symbolInfo.symbol, symbolInfo)
    }
    let occurrenceIndex = 0
    for (const [lineNumber, line] of input.lines.entries()) {
        out.push(' '.repeat(commentSyntax.length))
        out.push(line.replace('\t', ' '))
        out.push('\n')
        while (
            occurrenceIndex < document.occurrences.length &&
            document.occurrences[occurrenceIndex].range[0] === lineNumber
        ) {
            const occurrence = document.occurrences[occurrenceIndex]
            occurrenceIndex++
            if (occurrence.range.length > 3) {
                // Skip multiline occurrences for now.
                continue
            }
            const range = Range.fromLsif(occurrence.range)
            out.push(commentSyntax)
            out.push(' '.repeat(range.start.character))
            const length = range.end.character - range.start.character
            if (length < 0) {
                throw new Error(input.format(range, 'negative length occurrence!'))
            }
            out.push('^'.repeat(length))
            out.push(' ')
            const isDefinition = (occurrence.symbol_roles & lsiftyped.SymbolRole.Definition) > 0
            out.push(isDefinition ? 'definition' : 'AUTOCOMPLETE')
            out.push(' ')
            out.push(occurrence.symbol)
            const info = symbolTable.get(occurrence.symbol)
            if (!isDefinition || !info) {
                out.push('\n')
                continue
            }
            out.push('\n')
        }
    }
    return out.join('')
}

function occurrencesByLine(a: scip.scip.Occurrence, b: scip.scip.Occurrence): number {
    return Range.fromLsif(a.range).compare(Range.fromLsif(b.range))
}
