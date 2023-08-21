import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

import { isDefined, PreciseContext } from '@sourcegraph/cody-shared'
import { ActiveTextEditorSelectionRange, Editor } from '@sourcegraph/cody-shared/src/editor'
import { GraphContextFetcher } from '@sourcegraph/cody-shared/src/graph-context'

export class GraphContextProvider implements GraphContextFetcher {
    constructor(private editor: Editor) {}

    public getContext(): Promise<PreciseContext[]> {
        return getGraphContextFromEditor(this.editor)
    }
}

/**
 * Return the definitions of symbols that occur within the editor's active document. If there is
 * an active selection, we will cull the symbols to those referenced in intersecting document symbol
 * ranges.
 */
export const getGraphContextFromEditor = async (editor: Editor): Promise<PreciseContext[]> => {
    const activeEditor = editor.getActiveTextEditor()
    const workspaceRootUri = editor.getWorkspaceRootUri()
    if (!activeEditor || !workspaceRootUri) {
        return []
    }

    // Debuggin'
    const label = 'precise context from editor'
    performance.mark(label)

    const uri = workspaceRootUri.with({ path: activeEditor.filePath })
    const contexts = await getGraphContextFromSelection(
        { uri, range: activeEditor.selectionRange },
        new Map([[uri.fsPath, activeEditor.content.split('\n')]])
    )

    // Debuggin'
    console.debug(`Retrieved ${contexts.length} non-file-local context snippets`)
    performance.mark(label)
    return contexts
}

interface Selection {
    uri: URI
    range?: ActiveTextEditorSelectionRange
}

/**
 * Return the definitions of symbols that occur within the given selection ranges. If a selection has
 * a defined range, we will cull the symbols to those referenced in intersecting document symbol ranges.
 */
const getGraphContextFromSelection = async (
    selection: Selection,
    contentMap: Map<string, string[]>
): Promise<PreciseContext[]> => {
    // Debuggin'
    const label = 'precise context from selection'
    performance.mark(label)

    const { uri: activeEditorFileUri } = selection
    const activeEditorLines = contentMap.get(activeEditorFileUri.fsPath)
    if (!activeEditorLines) {
        return []
    }

    // Get the document symbols in the current file and extract their definition range
    const relevantDocumentSymbolRanges = await extractRelevantDocumentSymbolRanges([selection])

    // Extract identifiers from the relevant document symbol ranges and request their definitions
    const definitionMatches = await gatherDefinitions(activeEditorFileUri, relevantDocumentSymbolRanges, contentMap)

    // Resolve, extract, and deduplicate the URIs distinct from the active editor file
    const uris = dedupeWith(
        definitionMatches
            .map(({ locations }) => locations.map(({ uri }) => uri))
            .flat()
            .filter(uri => uri.fsPath !== activeEditorFileUri.fsPath), // TODO - post-process, instead we should filter out locals in current scope
        uri => uri.fsPath
    )

    // Resolve, extract, and deduplicate the symbol and location match pairs from the definition matches
    const matches = dedupeWith(
        definitionMatches
            .map(({ symbolName, locations }) => locations.map(location => ({ symbolName, location })))
            .flat(),
        ({ location }) => locationKeyFn(location)
    )

    // Open each URI in the current workspace, and make the document content retrievable by filepath.
    // Add the content of each newly opened document into the shared content map for recursive calls.
    // NOTE: Before asking for data about a document it must be opened in the workspace. This forces
    // a resolution so that the following queries that require the document context will not fail with
    // an unknown document.
    for (const [fsPath, lines] of await unwrapThenableMap(
        new Map(
            uris.map(uri => [
                uri.fsPath,
                vscode.workspace.openTextDocument(uri.fsPath).then(document => document.getText().split('\n')),
            ])
        )
    )) {
        contentMap.set(fsPath, lines)
    }

    // Extract definition text from our matches
    const contexts = await extractDefinitionContexts(matches, contentMap)

    // Debuggin'
    console.debug(`Retrieved ${contexts.length} context snippets`)
    performance.mark(label)
    return contexts
}

/**
 * Get the document symbols in files indicated by the given selections and extract the symbol ranges.
 * This will give us indication of where either the user selection and cursor is located or the range
 * of a relevant definition we've fetched in a previous iteration, which we assume to be the most
 * relevant code to the current question.
 */
export const extractRelevantDocumentSymbolRanges = async (
    selections: Selection[],
    getDocumentSymbolRanges: typeof defaultGetDocumentSymbolRanges = defaultGetDocumentSymbolRanges
): Promise<vscode.Range[]> => {
    const rangeMap = await unwrapThenableMap(
        new Map(
            dedupeWith(
                selections.map(({ uri }) => uri),
                uri => uri.fsPath
            ).map(uri => [uri.fsPath, getDocumentSymbolRanges(uri)])
        )
    )

    const pathsByUri = new Map<string, (ActiveTextEditorSelectionRange | undefined)[]>()
    for (const { uri, range } of selections) {
        pathsByUri.set(uri.fsPath, [...(pathsByUri.get(uri.fsPath) ?? []), range])
    }

    const combinedRanges: vscode.Range[] = []
    for (const [fsPath, ranges] of pathsByUri.entries()) {
        const documentSymbolRanges = rangeMap.get(fsPath)
        if (!documentSymbolRanges) {
            continue
        }

        // Filter the document symbol ranges to just those whose range intersects the selection.
        // If no selection exists (if we have an undefined in the ranges list), keep all symbols,
        // we'll utilize all document symbol ranges.
        const definedRanges = ranges.filter(isDefined)
        combinedRanges.push(
            ...(definedRanges.length < ranges.length
                ? documentSymbolRanges
                : documentSymbolRanges.filter(({ start, end }) =>
                      definedRanges.some(range => start.line <= range.end.line && range.start.line <= end.line)
                  ))
        )
    }

    return combinedRanges
}

const identifierPattern = /[$A-Z_a-z][\w$]*/g

const goKeywords = new Set([
    'break',
    'case',
    'chan',
    'const',
    'continue',
    'default',
    'defer',
    'else',
    'fallthrough',
    'for',
    'func',
    'go',
    'goto',
    'if',
    'import',
    'interface',
    'map',
    'package',
    'range',
    'return',
    'select',
    'struct',
    'switch',
    'type',
    'var',
])

const typescriptKeywords = new Set([
    'any',
    'as',
    'boolean',
    'break',
    'case',
    'catch',
    'class',
    'const',
    'constructor',
    'continue',
    'debugger',
    'declare',
    'default',
    'delete',
    'do',
    'else',
    'enum',
    'export',
    'extends',
    'false',
    'finally',
    'for',
    'from',
    'function',
    'if',
    'implements',
    'import',
    'in',
    'instanceof',
    'interface',
    'let',
    'module',
    'new',
    'null',
    'number',
    'of',
    'package',
    'private',
    'protected',
    'public',
    'require',
    'return',
    'static',
    'string',
    'super',
    'switch',
    'symbol',
    'this',
    'throw',
    'true',
    'try',
    'type',
    'typeof',
    'var',
    'void',
    'while',
    'with',
    'yield',
])

const commonKeywords = new Set([...goKeywords, ...typescriptKeywords])

interface SymbolDefinitionMatches {
    symbolName: string
    locations: Thenable<vscode.Location[]>
}

interface ResolvedSymbolDefinitionMatches {
    symbolName: string
    locations: vscode.Location[]
}

/**
 * Search the given ranges identifier definitions matching an a common identifier pattern and filter out
 * common keywords. Each matching symbol is queried for definitions which are resolved in parallel before
 * return.
 */
export const gatherDefinitions = async (
    uri: URI,
    ranges: vscode.Range[],
    contentMap: Map<string, string[]>,
    getDefinitions: typeof defaultGetDefinitions = defaultGetDefinitions
): Promise<ResolvedSymbolDefinitionMatches[]> => {
    const lines = contentMap.get(uri.fsPath)
    if (!lines) {
        return []
    }

    // Construct a list of symbol and definition location pairs by querying the LSP server
    // with all identifiers (heuristically chosen via regex) in the relevant code ranges.
    const definitionMatches: SymbolDefinitionMatches[] = []
    for (const { start, end } of ranges) {
        for (const [lineIndex, line] of lines.slice(start.line, end.line + 1).entries()) {
            for (const match of line.matchAll(identifierPattern)) {
                if (match.index === undefined || commonKeywords.has(match[0])) {
                    continue
                }

                definitionMatches.push({
                    symbolName: match[0],
                    locations: getDefinitions(uri, new vscode.Position(start.line + lineIndex, match.index + 1)),
                })
            }
        }
    }

    return Promise.all(
        definitionMatches.map(async ({ symbolName, locations }) => ({ symbolName, locations: await locations }))
    )
}

/**
 * For each match, extract the definition text from the given map of file contents. The given content map
 * is expected to hold the contents of the file indicated by the definition's location URI, and the file
 * is assumed to be open in the current VSCode workspace. Matches without such an entry are skipped.
 */
export const extractDefinitionContexts = async (
    matches: { symbolName: string; location: vscode.Location }[],
    contentMap: Map<string, string[]>,
    getDocumentSymbolRanges: typeof defaultGetDocumentSymbolRanges = defaultGetDocumentSymbolRanges
): Promise<PreciseContext[]> => {
    // Retrieve document symbols for each of the open documents, which we will use to extract the relevant
    // definition "bounds" given the range of the definition symbol (which is contained within the range).
    const documentSymbolsMap = new Map(
        [...contentMap.keys()]
            .filter(fsPath => matches.some(({ location }) => location.uri.fsPath === fsPath))
            .map(fsPath => [fsPath, getDocumentSymbolRanges(vscode.Uri.file(fsPath))])
    )

    // NOTE: In order to make sure the loop below is unblocked we'll also force resolve the entirety
    // of the folding range requests. That way we don't have a situation where the first iteration of
    // the loop is waiting on the last promise to be resolved in the set.
    await Promise.all([...documentSymbolsMap.values()])

    // Piece everything together. For each matching definition, extract the relevant lines given the
    // containing document's content and folding range result. Downstream consumers of this function
    // are expected to filter and re-rank these results as needed for their specific use case.

    const contexts: PreciseContext[] = []
    for (const { symbolName, location } of matches) {
        const { uri, range } = location
        const contentPromise = contentMap.get(uri.fsPath)
        const documentSymbolsPromises = documentSymbolsMap.get(uri.fsPath)

        if (contentPromise && documentSymbolsPromises) {
            const content = contentPromise
            const documentSymbols = await documentSymbolsPromises // NOTE: already resolved)
            const definitionSnippets = extractSnippets(content, documentSymbols, [range])

            for (const definitionSnippet of definitionSnippets) {
                contexts.push({
                    symbol: {
                        fuzzyName: symbolName,
                    },
                    filePath: uri.fsPath,
                    range: {
                        startLine: range.start.line,
                        startCharacter: range.start.character,
                        endLine: range.end.line,
                        endCharacter: range.end.character,
                    },
                    definitionSnippet,
                })
            }
        }
    }

    return contexts
}

/**
 *
 * Shim for default LSP executeDocumentSymbolProvider call. Can be mocked for testing.
 */
const defaultGetDocumentSymbolRanges = async (uri: URI): Promise<vscode.Range[]> =>
    (
        await vscode.commands.executeCommand<(vscode.SymbolInformation | vscode.DocumentSymbol)[]>(
            'vscode.executeDocumentSymbolProvider',
            uri
        )
    ).map(extractSymbolRange)

/**
 * Shim for default LSP executeDefinitionProvider call. Can be mocked for testing.
 */
const defaultGetDefinitions = async (uri: URI, position: vscode.Position): Promise<vscode.Location[]> =>
    vscode.commands
        .executeCommand<(vscode.Location | vscode.LocationLink)[]>('vscode.executeDefinitionProvider', uri, position)
        .then(locations => locations.flatMap(extractLocation))

/**
 * Extract the definition range from the given symbol information or document symbol.
 */
const extractSymbolRange = (d: vscode.SymbolInformation | vscode.DocumentSymbol): vscode.Range =>
    isDocumentSymbol(d) ? d.range : d.location.range

const isDocumentSymbol = (s: vscode.SymbolInformation | vscode.DocumentSymbol): s is vscode.DocumentSymbol =>
    (s as vscode.DocumentSymbol).range !== undefined

/**
 * Convert the given location or location link into a location.
 */
const extractLocation = (l: vscode.Location | vscode.LocationLink): vscode.Location =>
    isLocationLink(l) ? new vscode.Location(l.targetUri, l.targetRange) : l

const isLocationLink = (l: vscode.Location | vscode.LocationLink): l is vscode.LocationLink =>
    (l as vscode.LocationLink).targetUri !== undefined

/**
 * Extract the content outlined by symbol ranges that intersect one of the target ranges.
 */
const extractSnippets = (lines: string[], symbolRanges: vscode.Range[], targetRanges: vscode.Range[]): string[] => {
    const intersectingRanges = symbolRanges.filter(fr =>
        targetRanges.some(r => fr.start.line <= r.start.line && r.end.line <= fr.end.line)
    )

    // NOTE: inclusive upper bound
    return intersectingRanges.map(fr => lines.slice(fr.start.line, fr.end.line + 1).join('\n'))
}

/**
 * Return a filtered version of the given array, de-duplicating items based on the given key function.
 * The order of the filtered array is not guaranteed to be related to the input ordering.
 */
const dedupeWith = <T>(items: T[], keyFn: (item: T) => string): T[] => [
    ...new Map(items.map(item => [keyFn(item), item])).values(),
]

/**
 * Returns a key unique to a given location for use with `dedupeWith`.
 */
const locationKeyFn = (location: vscode.Location): string =>
    `${location.uri}?L${location.range.start.line}:${location.range.start.character}`

/**
 * Convert a mapping from K -> Thenable<V> to a map of K -> V.
 */
const unwrapThenableMap = async <K, V>(m: Map<K, Thenable<V>>): Promise<Map<K, V>> => {
    // Force resolution so that the await in the loop below is unblocked.
    await Promise.all(m.values())

    const resolved = new Map<K, V>()
    for (const [k, v] of [...m.entries()]) {
        resolved.set(k, await v)
    }

    return resolved
}
