// Copy-pasted code from scip-typescript
import * as ts from 'typescript'
import * as ts_internals from './ts-internals'

export function getTSSymbolAtLocation(checker: ts.TypeChecker, node: ts.Node): ts.Symbol | undefined {
    const rangeNode: ts.Node = ts.isConstructorDeclaration(node) ? node.getFirstToken() ?? node : node
    const symbol = checker.getSymbolAtLocation(rangeNode)

    // If this is an alias, and the request came at the declaration location
    // get the aliased symbol instead. This allows for goto def on an import e.g.
    //   import {A, B} from "mod";
    // to jump to the implementation directly.
    if (
        symbol?.declarations &&
        symbol.flags & ts.SymbolFlags.Alias &&
        node.kind === ts.SyntaxKind.Identifier &&
        (node.parent === symbol.declarations[0] || ts_internals.shouldSkipAlias(symbol.declarations[0]))
    ) {
        const aliased = checker.getAliasedSymbol(symbol)
        if (aliased.declarations) {
            return aliased
        }
    }
    return symbol
}
