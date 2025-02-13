import * as vscode from 'vscode'

export const symbolIsFunctionLike = (symbol: vscode.DocumentSymbol) =>
    symbol.kind === vscode.SymbolKind.Function ||
    symbol.kind === vscode.SymbolKind.Class ||
    symbol.kind === vscode.SymbolKind.Method ||
    symbol.kind === vscode.SymbolKind.Constructor
