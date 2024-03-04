import * as vscode from 'vscode'

export const symbolIsVariableLike = (symbol: vscode.DocumentSymbol) =>
    symbol.kind === vscode.SymbolKind.Constant ||
    symbol.kind === vscode.SymbolKind.Variable ||
    symbol.kind === vscode.SymbolKind.Enum ||
    symbol.kind === vscode.SymbolKind.Interface

export const symbolIsFunctionLike = (symbol: vscode.DocumentSymbol) =>
    symbol.kind === vscode.SymbolKind.Function ||
    symbol.kind === vscode.SymbolKind.Class ||
    symbol.kind === vscode.SymbolKind.Method ||
    symbol.kind === vscode.SymbolKind.Constructor
