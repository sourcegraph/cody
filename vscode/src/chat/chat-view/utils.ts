import * as vscode from 'vscode'

import { getWorkspaceSymbols } from '../../editor/utils'

export interface ChatSymbolMatch {
    name: string
    uri: vscode.Uri
    relativePath: string
    range: vscode.Range
}

const maxResults = 15

export async function getFileMatches(query: string): Promise<string[]> {
    if (!query.trim()) {
        return []
    }
    const searchPattern = `**/*${query}{/**,*}*`
    const excludePattern = '**/*{.git,out,dist,bin,snap,node_modules,env}*/**'
    // Find a list of files that match the text
    const matches = await vscode.workspace.findFiles(searchPattern, excludePattern, maxResults)
    // sort by having less '/' in path to prioritize top-level matches
    return matches
        .map(uri => vscode.workspace.asRelativePath(uri.fsPath))
        ?.sort((a, b) => a.split('/').length - b.split('/').length)
}

export async function getSymbolsForChat(query: string): Promise<ChatSymbolMatch[]> {
    if (!query.trim() || query.trim().length < 3) {
        return []
    }
    // Find symbols matching the query text
    const symbols = (await getWorkspaceSymbols(query))
        ?.filter(
            symbol =>
                (symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method) &&
                !symbol.location.uri.fsPath.includes('node_modules/')
        )
        .slice(0, maxResults)

    if (!symbols.length) {
        return []
    }

    const matches = []

    for (const symbol of symbols) {
        matches.push({
            name: symbol.name,
            uri: symbol.location.uri,
            relativePath: vscode.workspace.asRelativePath(
                `${symbol.location.uri.fsPath}:${symbol.location.range.start.line}-${symbol.location.range.end.line}`
            ),
            range: symbol.location.range,
            kind: symbol.kind,
        })
    }
    return matches
}
