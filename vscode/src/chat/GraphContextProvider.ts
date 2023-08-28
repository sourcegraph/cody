import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

import { isDefined, PreciseContext } from '@sourcegraph/cody-shared'
import { Editor, Range , ActiveTextEditorSelectionRange, Editor } from '@sourcegraph/cody-shared/src/editor'
import { PreciseContext } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { isDefined } from '@sourcegraph/cody-shared/src/common'
import { GraphContextFetcher } from '@sourcegraph/cody-shared/src/graph-context'

export class GraphContextProvider implements GraphContextFetcher {
    constructor(private editor: Editor) {}

    public getContext(): Promise<PreciseContext[]> {
        return getGraphContextFromEditor(this.editor)
    }
}

const recursionLimit = 1

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
        [{ uri, range: activeEditor.selectionRange }],
        new Map([[uri.fsPath, activeEditor.content.split('\n')]]),
        recursionLimit
    )

    const nonLocalContexts = contexts.filter(({ filePath }) => filePath !== uri.fsPath)

    // Debuggin'
    console.debug(`Retrieved ${nonLocalContexts.length} non-file-local context snippets`)
    performance.mark(label)
    return nonLocalContexts
}

interface Selection {
    uri: URI
    range?: Range
    kind?: vscode.SymbolKind
}

interface PreciseContextWithSourceLocation extends PreciseContext {
    sourceLocation?: SourceLocation
}

/**
 * Return the definitions of symbols that occur within the given selection ranges. If a selection has
 * a defined range, we will cull the symbols to those referenced in intersecting document symbol ranges.
 */
const getGraphContextFromSelection = async (
    selections: Selection[],
    contentMap: Map<string, string[]>,
    recursionLimit: number = 0
): Promise<PreciseContextWithSourceLocation[]> => {
    // Debuggin'
    const label = 'precise context from selection'
    performance.mark(label)

    // Get the document symbols in the current file and extract their definition range
    const documentSymbolSelections = await extractRelevantDocumentSymbolRanges(selections)

    // Extract identifiers from the relevant document symbol ranges and request their definitions
    const definitionMatches = await gatherDefinitionSymbolsForSelections(documentSymbolSelections, contentMap)
    const definitionContexts = await openDocumentsAndExtractDefinitionContexts(contentMap, definitionMatches)

    // Partition contexts contexts into interfaces and non-interface values
    const ifaceContexts = definitionContexts.filter(context => context.symbol.kind === 'Interface')
    const nonIfaceContexts = definitionContexts.filter(context => context.symbol.kind !== 'Interface')

    // Debuggin'
    performance.mark(label)

    // Re-query the definitions of interfaces to go directly to their implementation rather than the
    // definition of the interface (which doesn't include any internal information, just the shape).
    const implMatches = await gatherImplementationSymbolsForSelection(documentSymbolSelections, ifaceContexts)
    const implContexts = await openDocumentsAndExtractDefinitionContexts(contentMap, implMatches)

    // Merge relevant contexts back together into a unified list
    const contexts = [...nonIfaceContexts, ...implContexts /* , ...ifaceContexts */]

    // Debuggin'
    console.debug(
        `Retrieved ${definitionContexts.length} non-interface context snippets and ${ifaceContexts.length} interface context snippets`
    )
    performance.mark(label)

    if (recursionLimit > 0) {
        contexts.push(
            ...(await getGraphContextFromSelection(
                contexts.map(({ filePath, range, symbol }) => ({
                    uri: URI.file(filePath),
                    range: range
                        ? new vscode.Range(range.startLine, range.startCharacter, range.endLine, range.endCharacter)
                        : undefined,
                    kind: symbol.kind ? (symbolKindNameToIndex.get(symbol.kind) as vscode.SymbolKind) : undefined,
                })),
                contentMap,
                recursionLimit - 1
            ))
        )
    }

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
    getDocumentSymbolMetadata: typeof defaultGetDocumentSymbolMetadata = defaultGetDocumentSymbolMetadata
): Promise<Selection[]> => {
    const documentSymbolMetadataMap = await unwrapThenableMap(
        new Map(
            dedupeWith(
                selections.map(({ uri }) => uri),
                uri => uri.fsPath
            ).map(uri => [uri.fsPath, getDocumentSymbolMetadata(uri)])
        )
    )

    const selectionByUri = new Map<string, Omit<Selection, 'uri'>[]>()
    for (const { uri, ...rest } of selections) {
        selectionByUri.set(uri.fsPath, [...(selectionByUri.get(uri.fsPath) ?? []), { ...rest }])
    }

    const combinedRanges: Selection[] = []
    for (const [fsPath, selections] of selectionByUri.entries()) {
        const documentSymbolMetadata = documentSymbolMetadataMap.get(fsPath)
        if (!documentSymbolMetadata) {
            continue
        }

        // Filter the document symbol ranges to just those whose range intersects the selection.
        // If no selection exists (if we have an undefined in the ranges list), keep all symbols,
        // we'll utilize all document symbol ranges.
        const definedRanges = selections.filter(isDefined)
        combinedRanges.push(
            ...(definedRanges.length < selections.length
                ? documentSymbolMetadata
                : documentSymbolMetadata.filter(({ range: { start, end } }) =>
                      definedRanges.some(selection =>
                          selection.range
                              ? start.line <= selection.range.end.line && selection.range.start.line <= end.line
                              : true
                      )
                  )
            ).map(({ ...rest }) => ({ uri: URI.file(fsPath), ...rest }))
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

interface SymbolMatch {
    symbolName: string
    locations: Thenable<vscode.Location[]>
    kind?: vscode.SymbolKind
    sourceLocation?: SourceLocation
}

interface SourceLocation {
    uri: URI
    position: vscode.Position
}

interface ResolvedSymbolMatches extends Omit<SymbolMatch, 'locations'> {
    locations: vscode.Location[]
}

interface ResolvedSymbolMatch extends Omit<SymbolMatch, 'locations'> {
    location: vscode.Location
}

// NOTE: this must be kept up-to-date with vscode.SymbolKind enum tags.
const symbolKindNames = [
    'File', //  0
    'Module', //  1
    'Namespace', //  2
    'Package', //  3
    'Class', //  4
    'Method', //  5
    'Property', //  6
    'Field', //  7
    'Constructor', //  8
    'Enum', //  9
    'Interface', // 10
    'Function', // 11
    'Variable', // 12
    'Constant', // 13
    'String', // 14
    'Number', // 15
    'Boolean', // 16
    'Array', // 17
    'Object', // 18
    'Key', // 19
    'Null', // 20
    'EnumMember', // 21
    'Struct', // 22
    'Event', // 23
    'Operator', // 24
    'TypeParameter', // 25
]

const symbolKindNameToIndex = new Map([...symbolKindNames.entries()].map(([index, name]) => [name, index]))
const symbolKindIndexToName = new Map([...symbolKindNames.entries()].map(([index, name]) => [index, name]))

/**
 * Search the given ranges for identifiers matching an a common pattern and filter out common keywords. Each
 * matching symbol is queried for a related symbol definition which are resolved in parallel before return.
 */
export const gatherDefinitionSymbolsForSelections = async (
    selections: Selection[],
    contentMap: Map<string, string[]>,
    getDefinitions: typeof defaultGetDefinitions = defaultGetDefinitions
): Promise<ResolvedSymbolMatches[]> => {
    // Construct a list of symbol and definition location pairs by querying the LSP server
    // with all identifiers (heuristically chosen via regex) in the relevant code ranges.
    const definitionMatches: SymbolMatch[] = []

    for (const selection of selections) {
        const { uri, range, kind } = selection
        const lines = contentMap.get(uri.fsPath)
        if (!range || !lines) {
            continue
        }

        const requestQueue: { symbolName: string; position: vscode.Position }[] = []
        for (const { start, end } of [range]) {
            for (const [lineIndex, line] of lines.slice(start.line, end.line + 1).entries()) {
                // NOTE: pretty hacky - strip out C-style line comments and find everything
                // that might look like it could be an identifier. If we end up running a
                // VSCode provider over this cursor position and it's not a symbol we can
                // use, we'll just get back an empty location list.
                const identifierMatches = line.replace(/\/\/.*$/, '').matchAll(identifierPattern)

                for (const match of identifierMatches) {
                    if (match.index === undefined || commonKeywords.has(match[0])) {
                        continue
                    }

                    requestQueue.push({
                        symbolName: match[0],
                        position: new vscode.Position(start.line + lineIndex, match.index + 1),
                    })
                }
            }
        }

        // NOTE: deduplicating here will save duplicate queries that are _likely_ to point to the
        // same definition, but we may be culling aggressively here for some edge cases. I don't
        // currently think that these are likely to be make-or-break a quality response on any
        // significant segment of real world questions, though.
        for (const { symbolName, position } of dedupeWith(requestQueue, ({ symbolName }) => symbolName)) {
            definitionMatches.push({
                symbolName,
                locations: getDefinitions(uri, position),
                kind,
                sourceLocation: {
                    uri,
                    position,
                },
            })
        }
    }

    return gatherSymbolsFromMatches(selections, definitionMatches)
}

/**
 * Query each given context position for a related symbol implementation which are resolved
 * in parallel before return.
 */
export const gatherImplementationSymbolsForSelection = async (
    selections: Selection[],
    contexts: PreciseContextWithSourceLocation[],
    getImplementations: typeof defaultGetImplementations = defaultGetImplementations
): Promise<ResolvedSymbolMatches[]> => {
    // Construct a list of symbol and implementation location pairs by querying the LSP
    // server with the positions within the given contexts. These are "second-round" queries
    // to find additional relevant context.
    const implementationMatches: SymbolMatch[] = []

    for (const {
        symbol: { fuzzyName, kind },
        sourceLocation,
    } of contexts) {
        if (!sourceLocation) {
            continue
        }

        const { uri, position } = sourceLocation

        implementationMatches.push({
            symbolName: fuzzyName ? `${fuzzyName} (impl)` : 'unknown',
            locations: getImplementations(uri, position),
            kind: kind ? symbolKindNameToIndex.get(kind) : undefined,
            sourceLocation: {
                uri,
                position,
            },
        })
    }

    return gatherSymbolsFromMatches(selections, implementationMatches)
}

/**
 * Resolve the given matches and filter out the results in one of the given input selections.
 */
const gatherSymbolsFromMatches = async (
    selections: Selection[],
    matches: SymbolMatch[]
): Promise<ResolvedSymbolMatches[]> => {
    // Resolve all in-flight promises in parallel
    const resolvedMatches = await Promise.all(
        matches.map(async ({ locations, ...rest }) => ({ locations: await locations, ...rest }))
    )

    // Remove ranges that exist within one of the input selections. These are locals and
    // don't give us any additional information in the context window. Remove any remaining
    // symbols that have an empty set of locations.
    const filteredMatches = resolvedMatches
        .map(({ locations, ...rest }) => ({
            locations: locations.filter(
                ({ uri, range }) =>
                    !selections.some(
                        ({ uri: selectionUri, range: selectionRange }) =>
                            uri.fsPath === selectionUri.fsPath &&
                            (selectionRange === undefined ||
                                (selectionRange.start.line <= range.start.line &&
                                    range.end.line <= selectionRange.end.line))
                    )
            ),
            ...rest,
        }))
        .filter(({ locations }) => locations.length !== 0)

    // It's possible that there are many references to the same symbol in the given selection.
    // Deduplicate such target locations early here.
    return dedupeWith(filteredMatches, resolvedSymbolMatchKeyFn)
}

/**
 * Open the URIs present in the given definition matches and extract the definition text from the given
 * map of file contents.
 */
const openDocumentsAndExtractDefinitionContexts = async (
    contentMap: Map<string, string[]>,
    definitionMatches: ResolvedSymbolMatches[]
): Promise<PreciseContextWithSourceLocation[]> => {
    // Open the documents not currently present in the workspace.
    //
    // NOTE: Before asking for data about a document it must be opened in the workspace. This forces
    // a resolution so that the following queries that require the document context will not fail with
    // an unknown document.
    await openDocuments(definitionMatches, contentMap)

    // Extract definition text from our matches
    const flattenedMatches = definitionMatches.flatMap(({ locations, ...rest }) =>
        locations.map(location => ({ location, ...rest }))
    )
    const uniqueMatches = dedupeWith(flattenedMatches, ({ location }) => locationKeyFn(location))
    return extractDefinitionContexts(uniqueMatches, contentMap)
}

/**
 * Open each URI referenced by one of the given matches in the current workspace, and make the document
 * content retrievable by filepath by adding it to the shared content map.
 */
const openDocuments = async (matches: ResolvedSymbolMatches[], contentMap: Map<string, string[]>): Promise<void> => {
    const uris = matches.map(({ locations }) => locations.map(({ uri }) => uri)).flat()
    const uniqueUris = dedupeWith(uris, uri => uri.fsPath)
    const unseenUris = uniqueUris.filter(uri => !contentMap.has(uri.fsPath))
    const newContentMap = new Map(
        unseenUris.map(uri => [
            uri.fsPath,
            vscode.workspace.openTextDocument(uri.fsPath).then(document => document.getText().split('\n')),
        ])
    )

    for (const [fsPath, lines] of await unwrapThenableMap(newContentMap)) {
        contentMap.set(fsPath, lines)
    }
}

/**
 * For each match, extract the definition text from the given map of file contents. The given content map
 * is expected to hold the contents of the file indicated by the definition's location URI, and the file
 * is assumed to be open in the current VSCode workspace. Matches without such an entry are skipped.
 */
export const extractDefinitionContexts = async (
    matches: ResolvedSymbolMatch[],
    contentMap: Map<string, string[]>,
    getDocumentSymbolMetadata: typeof defaultGetDocumentSymbolMetadata = defaultGetDocumentSymbolMetadata
): Promise<PreciseContextWithSourceLocation[]> => {
    // Retrieve document symbols for each of the open documents, which we will use to extract the relevant
    // definition "bounds" given the range of the definition symbol (which is contained within the range).
    const documentSymbolMetadataPromiseMap = new Map(
        [...contentMap.keys()]
            .filter(fsPath => matches.some(({ location }) => location.uri.fsPath === fsPath))
            .map(fsPath => [fsPath, getDocumentSymbolMetadata(vscode.Uri.file(fsPath))])
    )

    // NOTE: In order to make sure the loop below is unblocked we'll also force resolve the entirety
    // of the document symbol requests. That way we don't have a situation where the first iteration
    // of the loop is waiting on the last promise to be resolved in the set.
    const documentSymbolMetadataMap = await unwrapThenableMap(documentSymbolMetadataPromiseMap)

    // Piece everything together. For each matching definition, extract the relevant lines given the
    // containing document's content and document symbol result. Downstream consumers of this function
    // are expected to filter and re-rank these results as needed for their specific use case.

    const contexts: PreciseContextWithSourceLocation[] = []
    for (const { symbolName, location, sourceLocation } of matches) {
        const { uri, range } = location
        const contentPromise = contentMap.get(uri.fsPath)
        const documentSymbolMetadata = documentSymbolMetadataMap.get(uri.fsPath)

        if (contentPromise && documentSymbolMetadata) {
            const content = contentPromise
            const definitionSnippets = extractSnippets(content, documentSymbolMetadata, [range])

            for (const { snippet, kind } of definitionSnippets) {
                contexts.push({
                    symbol: {
                        fuzzyName: symbolName,
                        kind: kind ? symbolKindIndexToName.get(kind) : undefined,
                    },
                    filePath: uri.fsPath,
                    range: {
                        startLine: range.start.line,
                        startCharacter: range.start.character,
                        endLine: range.end.line,
                        endCharacter: range.end.character,
                    },
                    definitionSnippet: snippet,
                    sourceLocation,
                })
            }
        }
    }

    return contexts
}

export interface DocumentSymbolMetadata {
    range: vscode.Range
    kind?: vscode.SymbolKind
}

/**
 *
 * Shim for default LSP executeDocumentSymbolProvider call. Can be mocked for testing.
 */
const defaultGetDocumentSymbolMetadata = async (uri: URI): Promise<DocumentSymbolMetadata[]> =>
    (
        await vscode.commands.executeCommand<(vscode.SymbolInformation | vscode.DocumentSymbol)[]>(
            'vscode.executeDocumentSymbolProvider',
            uri
        )
    ).map(extractSymbolMetadata)

/**
 * Shim for default LSP executeDefinitionProvider call. Can be mocked for testing.
 */
const defaultGetDefinitions = async (uri: URI, position: vscode.Position): Promise<vscode.Location[]> =>
    vscode.commands
        .executeCommand<(vscode.Location | vscode.LocationLink)[]>('vscode.executeDefinitionProvider', uri, position)
        .then(locations => locations.flatMap(extractLocation))

/**
 * Shim for default LSP executeImplementationProvider call. Can be mocked for testing.
 */
const defaultGetImplementations = async (uri: URI, position: vscode.Position): Promise<vscode.Location[]> =>
    vscode.commands
        .executeCommand<(vscode.Location | vscode.LocationLink)[]>(
            'vscode.executeImplementationProvider',
            uri,
            position
        )
        .then(locations => locations.flatMap(extractLocation))

/**
 * Extract the definition range from the given symbol information or document symbol.
 */
const extractSymbolMetadata = (d: vscode.SymbolInformation | vscode.DocumentSymbol): DocumentSymbolMetadata =>
    isDocumentSymbol(d) ? { kind: d.kind, range: d.range } : { kind: d.kind, range: d.location.range }

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
const extractSnippets = (
    lines: string[],
    documentSymbolMetadata: DocumentSymbolMetadata[],
    targetRanges: vscode.Range[]
): { snippet: string; kind?: vscode.SymbolKind }[] => {
    const intersectingRanges = documentSymbolMetadata.filter(({ range: { start, end } }) =>
        targetRanges.some(
            ({ start: targetStart, end: targetEnd }) => start.line <= targetStart.line && targetEnd.line <= end.line
        )
    )

    // NOTE: inclusive upper bound
    return intersectingRanges.map(({ range: { start, end }, kind }) => ({
        snippet: lines.slice(start.line, end.line + 1).join('\n'),
        kind,
    }))
}

/**
 * Return a filtered version of the given array, de-duplicating items based on the given key function.
 * The order of the filtered array is not guaranteed to be related to the input ordering.
 */
const dedupeWith = <T>(items: T[], keyFn: (item: T) => string): T[] => [
    ...new Map(items.map(item => [keyFn(item), item])).values(),
]

/**
 * Returns a key unique to a given symbol definition match.
 */
const resolvedSymbolMatchKeyFn = (match: ResolvedSymbolMatches): string =>
    `${match.symbolName}.${match.locations.map(locationKeyFn).join('.')}`

/**
 * Returns a key unique to a given location for use with `dedupeWith`.
 */
const locationKeyFn = (location: vscode.Location): string =>
    `${location.uri.fsPath}?L${location.range.start.line}:${location.range.start.character}`

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
