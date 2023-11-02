import { basename, dirname } from 'path'

import * as vscode from 'vscode'

import { ChatUserContext } from '@sourcegraph/cody-shared/src/chat/context'

import { getWorkspaceSymbols } from '../../editor/utils'

export interface ChatSymbolMatch {
    name: string
    uri: vscode.Uri
    relativePath: string
    range: vscode.Range
    kind: string
}

export async function getFileMatchesForChat(query: string): Promise<ChatUserContext[]> {
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
        .map(uri => ({
            title: basename(uri?.fsPath),
            fsPath: uri?.fsPath,
            kind: 'file',
            relativePath: vscode.workspace.asRelativePath(uri?.fsPath),
            description: dirname(uri?.fsPath),
        }))
        ?.sort((a, b) => a.title.split('/').length - b.title.split('/').length)
}

export async function getSymbolsForChat(query: string, maxResults = 10): Promise<ChatUserContext[]> {
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
        const kind = symbol.kind === vscode.SymbolKind.Class ? 'class' : 'function'
        matches.push({
            title: symbol.name,
            relativePath: vscode.workspace.asRelativePath(symbol.location?.uri?.fsPath),
            fsPath: symbol.location.uri.fsPath,
            description: vscode.workspace.asRelativePath(
                `${symbol.location.uri.fsPath}:${symbol.location.range.start.line}-${symbol.location.range.end.line}`
            ),
            lines: {
                start: symbol.location.range.start.line,
                end: symbol.location.range.end.line,
            },
            kind,
        })
    }
    return matches
}

export function getOpenTabsUris(): vscode.Uri[] {
    const uris = []
    // Get open tabs
    const tabGroups = vscode.window.tabGroups.all
    const openTabs = tabGroups.flatMap(group => group.tabs.map(tab => tab.input)) as vscode.TabInputText[]

    for (const tab of openTabs) {
        // Skip non-file URIs
        if (tab?.uri?.scheme === 'file') {
            uris.push(tab.uri)
        }
    }
    return uris
}

export function getOpenTabsRelativePaths(): ChatUserContext[] {
    return getOpenTabsUris()?.map(uri => ({
        title: basename(uri?.fsPath),
        fsPath: uri.fsPath,
        kind: 'file',
        relativePath: vscode.workspace.asRelativePath(uri.fsPath),
        description: dirname(uri?.fsPath),
    }))
}
