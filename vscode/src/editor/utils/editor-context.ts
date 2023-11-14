import { basename, dirname } from 'path'

import * as vscode from 'vscode'

import { ContextFile } from '@sourcegraph/cody-shared'
import { ContextFileSource, ContextFileType, SymbolKind } from '@sourcegraph/cody-shared/src/codebase-context/messages'

import { getOpenTabsUris, getWorkspaceSymbols } from '.'

// Create context files from editor sources

export async function getFileContextFile(query: string, maxResults = 15): Promise<ContextFile[]> {
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
    return matches?.map(uri => createContextFileFromUri(uri))
}

export async function getSymbolContextFile(query: string, maxResults = 10): Promise<ContextFile[]> {
    // NOTE: Symbol search is resources extensive, so only search if query is long enough
    // Five is an arbitrary minimum length
    if (!query.trim() || query.trim().length < 5) {
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
        const kind: SymbolKind = symbol.kind === vscode.SymbolKind.Class ? 'class' : 'function'
        const source: ContextFileSource = 'user'
        const contextFile: ContextFile = createContextFileFromUri(
            symbol.location.uri,
            source,
            'symbol',
            symbol.location.range,
            kind
        )
        contextFile.fileName = symbol.name
        matches.push(contextFile)
    }

    return matches
}

export function getOpenTabsContextFile(): ContextFile[] {
    return getOpenTabsUris()?.map(uri => createContextFileFromUri(uri))
}

function createContextFileFromUri(
    uri: vscode.Uri,
    source: ContextFileSource = 'user',
    type: ContextFileType = 'file',
    selectionRange?: vscode.Range,
    kind?: SymbolKind
): ContextFile {
    const range = selectionRange ? createContextFileRange(selectionRange) : selectionRange
    return {
        fileName: vscode.workspace.asRelativePath(uri.fsPath),
        uri,
        path: createContextFilePath(uri),
        range,
        type,
        source,
        kind,
    }
}

function createContextFileRange(selectionRange: vscode.Range): ContextFile['range'] {
    return {
        start: {
            line: selectionRange.start.line,
            character: selectionRange.start.character,
        },
        end: {
            line: selectionRange.end.line,
            character: selectionRange.end.character,
        },
    }
}

function createContextFilePath(uri: vscode.Uri): ContextFile['path'] {
    return {
        basename: basename(uri.fsPath),
        dirname: dirname(uri.fsPath),
        relative: vscode.workspace.asRelativePath(uri.fsPath),
    }
}
