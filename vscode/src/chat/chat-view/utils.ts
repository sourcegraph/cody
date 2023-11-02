import * as vscode from 'vscode'

import { ChatInputContext } from '@sourcegraph/cody-shared/src/chat/context'

import { getWorkspaceSymbols } from '../../editor/utils'

export interface ChatSymbolMatch {
    name: string
    uri: vscode.Uri
    relativePath: string
    range: vscode.Range
    kind: string
}

export async function getFileMatchesForChat(query: string): Promise<ChatInputContext[]> {
    const maxResults = 15
    if (!query.trim()) {
        return []
    }
    const searchPattern = `**/*${query}{/**,*}*`
    const excludePattern = '**/{.,*.env,.git,out/,dist/,bin/,snap,node_modules}**'
    // Find a list of files that match the text
    const matches = await vscode.workspace.findFiles(searchPattern, excludePattern, maxResults)

    if (!matches.length) {
        return []
    }
    // sort by having less '/' in path to prioritize top-level matches
    return matches
        .map(uri => ({ title: vscode.workspace.asRelativePath(uri?.fsPath), fsPath: uri?.fsPath, kind: 'file' }))
        ?.sort((a, b) => a.title.split('/').length - b.title.split('/').length)
}

export async function getSymbolsForChat(query: string, maxResults = 10): Promise<ChatInputContext[]> {
    if (!query.trim() || query.trim().length < 3) {
        return []
    }
    // Find symbols matching the query text
    const symbols = (await getWorkspaceSymbols(query))
        ?.filter(
            symbol =>
                (symbol.kind === vscode.SymbolKind.Function ||
                    symbol.kind === vscode.SymbolKind.Method ||
                    symbol.kind === vscode.SymbolKind.Class) &&
                !symbol.location?.uri?.fsPath.includes('node_modules/')
        )
        .slice(0, maxResults)

    if (!symbols.length) {
        return []
    }

    const matches = []

    for (const symbol of symbols) {
        matches.push({
            name: symbol.name,
            fsPath: symbol.location.uri.fsPath,
            title: vscode.workspace.asRelativePath(
                `${symbol.location.uri.fsPath}:${symbol.location.range.start.line}-${symbol.location.range.end.line}`
            ),
            lines: {
                start: symbol.location.range.start.line,
                end: symbol.location.range.end.line,
            },
            kind: 'function', // TODO bee match symbol kind
        })
    }
    return matches
}
