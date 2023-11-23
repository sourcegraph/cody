import { basename, dirname } from 'path'

import fuzzysort from 'fuzzysort'
import * as vscode from 'vscode'

import { ContextFile } from '@sourcegraph/cody-shared'
import { ContextFileSource, ContextFileType, SymbolKind } from '@sourcegraph/cody-shared/src/codebase-context/messages'

import { getOpenTabsUris, getWorkspaceSymbols } from '.'

/**
 * Searches all workspaces for files matching the given string. VS Code doesn't
 * provide an API for fuzzy file searching, only precise globs, so we recreate
 * it by getting a list of all files across all workspaces and using fuzzysort.
 */
export async function getFileContextFiles(
    query: string,
    maxResults: number,
    token: vscode.CancellationToken
): Promise<ContextFile[]> {
    if (!query.trim()) {
        return []
    }

    const excludesPattern = '**/{.,*.env,.git,out/,dist/,bin/,snap,node_modules}**'

    // TODO(toolmantim): Check this performs with remote workspaces (do we need a UI spinner etc?)
    const uris = await vscode.workspace.findFiles('', excludesPattern, undefined, token)

    const results = fuzzysort.go(query, uris, {
        key: 'path',
        limit: maxResults,
        // Somewhere over 10k threshold is where it seems to return
        // results that make no sense for sg/sg. VS Code’s own fuzzy finder seems to cap
        // out much higher. To be safer and to account for longer paths from
        // even deeper source trees we use 100k. We may want to revisit this
        // number if we get reports of missing file results from very large
        // repos.
        threshold: -100000,
    })

    // TODO(toolmantim): Add fuzzysort.highlight data to the result so we can show it in the UI

    return results.map(result => createContextFileFromUri(result.obj))
}

export async function getSymbolContextFiles(query: string, maxResults = 20): Promise<ContextFile[]> {
    if (!query.trim()) {
        return []
    }

    const queryResults = await getWorkspaceSymbols(query) // doesn't support cancellation tokens

    const relevantQueryResults = queryResults?.filter(
        symbol =>
            (symbol.kind === vscode.SymbolKind.Function ||
                symbol.kind === vscode.SymbolKind.Method ||
                symbol.kind === vscode.SymbolKind.Class ||
                symbol.kind === vscode.SymbolKind.Interface ||
                symbol.kind === vscode.SymbolKind.Enum ||
                symbol.kind === vscode.SymbolKind.Struct ||
                symbol.kind === vscode.SymbolKind.Constant ||
                // in TS an export const is considered a variable
                symbol.kind === vscode.SymbolKind.Variable) &&
            // TODO(toolmantim): Remove once https://github.com/microsoft/vscode/pull/192798 is in use (test: do a symbol search and check no symbols exist from node_modules)
            !symbol.location?.uri?.fsPath.includes('node_modules/')
    )

    const results = fuzzysort.go(query, relevantQueryResults, {
        key: 'name',
        limit: maxResults,
    })

    // TODO(toolmantim): Add fuzzysort.highlight data to the result so we can show it in the UI

    const symbols = results.map(result => result.obj)

    if (!symbols.length) {
        return []
    }

    const matches = []
    for (const symbol of symbols) {
        // TODO(toolmantim): Update the kinds to match above
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
    return getOpenTabsUris()?.map(uri => createContextFileFromUri(
        uri,
        'user',
        'file',
        undefined,
        undefined,
        true
    ))
}

function createContextFileFromUri(
    uri: vscode.Uri,
    source: ContextFileSource = 'user',
    type: ContextFileType = 'file',
    selectionRange?: vscode.Range,
    kind?: SymbolKind,
    editorTab?: boolean
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
        editorTab
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
