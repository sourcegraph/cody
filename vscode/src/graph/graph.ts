import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

import { HoverContext, PreciseContext } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { dedupeWith, isDefined } from '@sourcegraph/cody-shared/src/common'
import { ActiveTextEditorSelectionRange, Editor } from '@sourcegraph/cody-shared/src/editor'

import { CustomAbortSignal } from '../completions/context/utils'
import { logDebug } from '../log'

import { createLimiter } from './limiter'

// TODO(efritz) - move to options object
const recursionLimit = 2

const limiter = createLimiter(
    // The concurrent requests limit is chosen so that it's high enough as to not cause throughput
    // issues but not too high so that all requests for a section are done concurrently and we have
    // no way to cancel queued requests.
    //
    // Assuming an average size of 40 symbols per scope and the need to fetch up to four sources of
    // language server APIs per section, this limit should be a good balance.
    40,
    // If any language server API takes more than 5 seconds to answer, we should cancel the request
    5000
)

/**
 * Return the definitions of symbols that occur within the editor's active document. If there is
 * an active selection, we will cull the symbols to those referenced in intersecting document symbol
 * ranges.
 *
 * NOTE: used only in chat, see `getGraphContextFromRange` for the new completions hotness.
 */
export const getGraphContextFromEditor = async (editor: Editor): Promise<PreciseContext[]> => {
    const activeEditor = editor.getActiveTextEditor()
    const workspaceRootUri = editor.getWorkspaceRootUri()
    if (!activeEditor || !workspaceRootUri) {
        return []
    }

    const label = 'getGraphContextFromEditor'
    performance.mark(label)

    const uri = workspaceRootUri.with({ path: activeEditor.filePath })
    const contexts = await getGraphContextFromSelection(
        [{ uri, range: activeEditor.selectionRange }],
        new Map([[uri.fsPath, activeEditor.content.split('\n')]]),
        recursionLimit
    )

    const filteredContexts = contexts.filter(({ filePath }) => filePath !== uri.fsPath)

    logDebug('GraphContext:filteredSnippetsRetrieved', `Retrieved ${filteredContexts.length} filtered context snippets`)
    performance.mark(label)
    return filteredContexts
}

/**
 * Return the definitions of symbols that occur within a specific range.
 *
 * This will return definitions from the same file as well and is intended to be used for smaller
 * context windows like autocomplete where we can't include the full file contents.
 *
 * The resulting snippets will all be from the same workspace.
 */
export const getGraphContextFromRange = async (
    editor: vscode.TextEditor,
    range: vscode.Range,
    abortSignal?: CustomAbortSignal
): Promise<HoverContext[]> => {
    const uri = editor.document.uri
    const contentMap = new Map([[uri.fsPath, editor.document.getText().split('\n')]])
    const selections = [{ uri, range }]

    const label = 'getGraphContextFromRange'
    performance.mark(label)

    // Get the document symbols in the current file and extract their definition range
    const definitionSelections = await extractRelevantDocumentSymbolRanges(selections)

    // Find the candidate identifiers to request definitions for in the selection
    const requestCandidates = gatherDefinitionRequestCandidates(definitionSelections, contentMap)

    // Extract hover (symbol, definition, type def, impl) text related to all of the request
    // candidates
    const resolvedHoverText = await gatherHoverText(contentMap, requestCandidates, abortSignal)

    const contexts = resolvedHoverText.flatMap(hoverContextFromResolvedHoverText)

    logDebug('GraphContext:snippetsRetrieved', `Retrieved ${contexts.length} hover context snippets`)
    performance.mark(label)
    return contexts
}

interface Selection {
    uri: URI
    range?: ActiveTextEditorSelectionRange
}

/**
 * Return the definitions of symbols that occur within the given selection ranges. If a selection
 * has a defined range, we will cull the symbols to those referenced in intersecting document symbol
 * ranges.
 */
const getGraphContextFromSelection = async (
    selections: Selection[],
    contentMap: Map<string, string[]>,
    recursionLimit: number = 0
): Promise<PreciseContext[]> => {
    const label = 'getGraphContextFromSelection'
    performance.mark(label)

    // Get the document symbols in the current file and extract their definition range
    const definitionSelections = await extractRelevantDocumentSymbolRanges(selections)

    // Find the candidate identifiers to request definitions for in the selection
    const requestCandidates = gatherDefinitionRequestCandidates(definitionSelections, contentMap)

    // Extract identifiers from the relevant document symbol ranges and request their definitions
    const definitionMatches = await gatherDefinitions(definitionSelections, requestCandidates)

    // NOTE: Before asking for data about a document it must be opened in the workspace. This forces
    // a resolution so that the following queries that require the document context will not fail with
    // an unknown document.

    await updateContentMap(
        contentMap,
        definitionMatches.map(({ definitionLocations }) => definitionLocations.map(({ uri }) => uri)).flat()
    )

    // Resolve, extract, and deduplicate the symbol and location match pairs from the definition matches
    const matches = dedupeWith(
        definitionMatches
            .map(({ definitionLocations, typeDefinitionLocations, implementationLocations, ...rest }) =>
                definitionLocations.map(location => ({ location, ...rest }))
            )
            .flat(),
        ({ symbolName, location }) => `${symbolName}:${locationKeyFn(location)}`
    )

    // TODO - see if we can remove fields of types we've also captured?

    // Extract definition text from our matches
    const contexts = await extractDefinitionContexts(matches, contentMap)

    logDebug('GraphContext:snippetsRetrieved', `Retrieved ${contexts.length} context snippets`)
    performance.mark(label)

    if (recursionLimit > 0) {
        contexts.push(
            ...(await getGraphContextFromSelection(
                contexts.map(c => ({
                    uri: URI.file(c.filePath),
                    range: c.range
                        ? new vscode.Range(
                              c.range.startLine,
                              c.range.startCharacter,
                              c.range.endLine,
                              c.range.endCharacter
                          )
                        : undefined,
                })),
                contentMap,
                recursionLimit - 1
            ))
        )
    }

    return contexts
}

/**
 * Open each URI referenced by a definition match in the current workspace, and make the document
 * content retrievable by filepath by adding it to the shared content map.
 */
const updateContentMap = async (contentMap: Map<string, string[]>, locations: vscode.Uri[]): Promise<void> => {
    const unseenDefinitionUris = dedupeWith(locations, 'fsPath').filter(uri => !contentMap.has(uri.fsPath))

    // Remove ultra-common type definitions that are probably already known by the LLM
    const filteredUnseenDefinitionUris = unseenDefinitionUris.filter(uri => !isCommonImport(uri))

    const newContentMap = new Map(
        filteredUnseenDefinitionUris.map(uri => [
            uri.fsPath,
            vscode.workspace.openTextDocument(uri.fsPath).then(document => document.getText().split('\n')),
        ])
    )

    for (const [fsPath, lines] of await unwrapThenableMap(newContentMap)) {
        contentMap.set(fsPath, lines)
    }
}

/**
 * Get the document symbols in files indicated by the given selections and extract the symbol
 * ranges. This will give us indication of where either the user selection and cursor is located or
 * the range of a relevant definition we've fetched in a previous iteration, which we assume to be
 * the most relevant code to the current question.
 */
export const extractRelevantDocumentSymbolRanges = async (
    selections: Selection[],
    getDocumentSymbolRanges: typeof defaultGetDocumentSymbolRanges = defaultGetDocumentSymbolRanges
): Promise<Selection[]> => {
    const rangeMap = await unwrapThenableMap(
        new Map(
            dedupeWith(
                selections.map(({ uri }) => uri),
                'fsPath'
            ).map(uri => [uri.fsPath, getDocumentSymbolRanges(uri)])
        )
    )

    const pathsByUri = new Map<string, (ActiveTextEditorSelectionRange | undefined)[]>()
    for (const { uri, range } of selections) {
        pathsByUri.set(uri.fsPath, [...(pathsByUri.get(uri.fsPath) ?? []), range])
    }

    const combinedRanges: Selection[] = []
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
                  )
            ).map(range => ({ uri: URI.file(fsPath), range }))
        )
    }

    return combinedRanges
}

export const identifierPattern = /[$A-Z_a-z][\w$]*/g

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

    // common variables, types we don't need to follow
    'ctx',
    'Context',
    'err',
    'error',
    'ok',
])

const typescriptKeywords = new Set([
    'any',
    'as',
    'async',
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

const commonImportPaths = new Set([
    // The TS lib folder contains the TS standard library and all of ECMAScript.
    'node_modules/typescript/lib',
    // The node library contains the standard node library.
    'node_modules/@types/node',
    // All CSS properties as TS types.
    'node_modules/csstype',
    // Common React type definitions.
    'node_modules/@types/react/',
    'node_modules/@types/prop-types',
    'node_modules/next/',

    // Go stdlib installation (covers Brew installs at a minimum)
    'libexec/src/',
])

function isCommonImport(uri: vscode.Uri): boolean {
    for (const importPath of commonImportPaths) {
        if (uri.fsPath.includes(importPath)) {
            return true
        }
    }
    return false
}

export const commonKeywords = new Set([...goKeywords, ...typescriptKeywords])

interface Request {
    symbolName: string
    uri: vscode.Uri
    position: vscode.Position
}

/**
 * Search the given ranges identifier definitions matching an a common identifier pattern and filter out
 * common keywords.
 */
export const gatherDefinitionRequestCandidates = (
    selections: Selection[],
    contentMap: Map<string, string[]>
): Request[] => {
    const requestCandidates: Request[] = []

    for (const selection of selections) {
        const { uri, range } = selection
        const lines = contentMap.get(uri.fsPath)
        if (!range || !lines) {
            continue
        }

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

                    requestCandidates.push({
                        symbolName: match[0],
                        uri,
                        position: new vscode.Position(start.line + lineIndex, match.index + 1),
                    })
                }
            }
        }
    }

    return requestCandidates
}

interface SymbolDefinitionMatches {
    symbolName: string
    hover: Thenable<vscode.Hover[]>
    definitionLocations: Thenable<vscode.Location[]>
    typeDefinitionLocations: Thenable<vscode.Location[]>
    implementationLocations: Thenable<vscode.Location[]>
}

interface ResolvedSymbolDefinitionMatches {
    symbolName: string
    hover: vscode.Hover[]
    definitionLocations: vscode.Location[]
    typeDefinitionLocations: vscode.Location[]
    implementationLocations: vscode.Location[]
}

/**
 * Query each of the candidate requests for definitions which are resolved in parallel before return.
 */
export const gatherDefinitions = async (
    selections: Selection[],
    requests: Request[],
    getHover: typeof defaultGetHover = defaultGetHover,
    getDefinitions: typeof defaultGetDefinitions = defaultGetDefinitions,
    getTypeDefinitions: typeof defaultGetTypeDefinitions = defaultGetTypeDefinitions,
    getImplementations: typeof defaultGetImplementations = defaultGetImplementations
): Promise<ResolvedSymbolDefinitionMatches[]> => {
    // Construct a list of symbol and definition location pairs by querying the LSP server
    // with all identifiers (heuristically chosen via regex) in the relevant code ranges.
    const definitionMatches: SymbolDefinitionMatches[] = []

    // NOTE: deduplicating here will save duplicate queries that are _likely_ to point to the
    // same definition, but we may be culling aggressively here for some edge cases. I don't
    // currently think that these are likely to be make-or-break a quality response on any
    // significant segment of real world questions, though.
    for (const { symbolName, uri, position } of dedupeWith(requests, 'symbolName')) {
        definitionMatches.push({
            symbolName,
            hover: getHover(uri, position),
            definitionLocations: getDefinitions(uri, position),
            typeDefinitionLocations: getTypeDefinitions(uri, position),
            implementationLocations: getImplementations(uri, position),
        })
    }

    // Resolve all in-flight promises in parallel
    const resolvedDefinitionMatches = await Promise.all(
        definitionMatches.map(
            async ({ symbolName, hover, definitionLocations, typeDefinitionLocations, implementationLocations }) => ({
                symbolName,
                hover: await hover,
                definitionLocations: await definitionLocations,
                typeDefinitionLocations: await typeDefinitionLocations,
                implementationLocations: await implementationLocations,
            })
        )
    )

    return (
        resolvedDefinitionMatches
            // Remove definition ranges that exist within one of the input definition selections
            // These are locals and don't give us any additional information in the context window.
            .map(({ definitionLocations, ...rest }) => ({
                definitionLocations: definitionLocations.filter(
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
            // Remove empty locations
            .filter(
                ({ definitionLocations, typeDefinitionLocations, implementationLocations }) =>
                    definitionLocations.length + typeDefinitionLocations.length + implementationLocations.length !== 0
            )
    )
}

interface UnresolvedHoverText {
    symbolName: string
    symbolLocation: vscode.Location
    definitionsPromise: Thenable<vscode.Location[]>
    typeDefinitionsPromise: Thenable<vscode.Location[]>
    implementationsPromise: Thenable<vscode.Location[]>
}

interface ResolvedHoverText {
    symbolName: string
    symbolLocation: vscode.Location
    definition?: ResolvedHoverElement
    typeDefinition?: ResolvedHoverElement
    implementations?: ResolvedHoverElement[]
}

interface ResolvedHoverElement {
    symbolName: string
    location: vscode.Location
    hover: vscode.Hover[]
}

const hoverToStrings = (h: vscode.Hover[]): string[] =>
    h
        .flatMap(h => h.contents.map(c => (typeof c === 'string' ? c : c.value)))
        .map(extractMarkdownCodeBlock)
        .map(s => s.trim())
        .filter(s => s !== '')

const hoverContextFromResolvedHoverText = (t: ResolvedHoverText): HoverContext[] =>
    [
        hoverContextFromElement(t.definition, 'definition'),
        hoverContextFromElement(t.typeDefinition, 'typeDefinition', t.symbolName),
        ...(t.implementations?.map(e => hoverContextFromElement(e, 'implementation', t.typeDefinition?.symbolName)) ??
            []),
    ].filter(isDefined)

const hoverContextFromElement = (
    element: ResolvedHoverElement | undefined,
    type: HoverContext['type'],
    sourceSymbolName?: string
): HoverContext | undefined => {
    if (element === undefined) {
        return undefined
    }

    let content = hoverToStrings(element.hover)

    // Filter out common hover texts that do not provide additional value
    content = content.filter(
        c => c.trim() !== `interface ${element.symbolName}` && c.trim() !== `class ${element.symbolName}`
    )

    if (content.length === 0) {
        return undefined
    }

    return {
        symbolName: element.symbolName,
        sourceSymbolName,
        type,
        content,
        uri: element.location.uri.toString(),
        range: {
            startLine: element.location.range.start.line,
            startCharacter: element.location.range.start.character,
            endLine: element.location.range.end.line,
            endCharacter: element.location.range.end.character,
        },
    }
}

function extractMarkdownCodeBlock(string: string): string {
    const lines = string.split('\n')
    const codeBlocks: string[] = []
    let isCodeBlock = false
    for (const line of lines) {
        const isCodeBlockDelimiter = line.trim().startsWith('```')

        if (isCodeBlockDelimiter && !isCodeBlock) {
            isCodeBlock = true
        } else if (isCodeBlockDelimiter && isCodeBlock) {
            isCodeBlock = false
        } else if (isCodeBlock) {
            codeBlocks.push(line)
        }
    }

    return codeBlocks.join('\n')
}

/**
 * Query each of the candidate requests for hover texts which are resolved in parallel before return.
 */
export const gatherHoverText = async (
    contentMap: Map<string, string[]>,
    requests: Request[],
    abortSignal?: CustomAbortSignal,
    getHover: typeof defaultGetHover = defaultGetHover,
    getDefinitions: typeof defaultGetDefinitions = defaultGetDefinitions,
    getTypeDefinitions: typeof defaultGetTypeDefinitions = defaultGetTypeDefinitions,
    getImplementations: typeof defaultGetImplementations = defaultGetImplementations
): Promise<ResolvedHoverText[]> => {
    // Construct a list of symbol and definition location pairs by querying the LSP server
    // with all identifiers (heuristically chosen via regex) in the relevant code ranges.
    const hoverMatches: UnresolvedHoverText[] = []

    // NOTE: deduplicating here will save duplicate queries that are _likely_ to point to the
    // same definition, but we may be culling aggressively here for some edge cases. I don't
    // currently think that these are likely to be make-or-break a quality response on any
    // significant segment of real world questions, though.

    for (const { uri, symbolName, position } of dedupeWith(requests, 'symbolName')) {
        hoverMatches.push({
            symbolName,
            symbolLocation: new vscode.Location(uri, position),
            definitionsPromise: limiter(() => getDefinitions(uri, position), abortSignal),
            typeDefinitionsPromise: limiter(() => getTypeDefinitions(uri, position), abortSignal),
            implementationsPromise: limiter(() => getImplementations(uri, position), abortSignal),
        })
    }

    // Resolve the definition/type definition/implementations queries above in parallel and extract
    // and deduplicate the locations. We're going to request hover text from each of these next.
    const locationsForHover = dedupeWith(
        (
            await Promise.all(
                hoverMatches.map(async ({ definitionsPromise, typeDefinitionsPromise, implementationsPromise }) => [
                    ...(await definitionsPromise),
                    ...(await typeDefinitionsPromise),
                    ...(await implementationsPromise),
                ])
            )
        ).flat(),
        locationKeyFn
    )

    // NOTE: Before asking for data about a document it must be opened in the workspace. This forces
    // a resolution so that the following queries that require the document context will not fail with
    // an unknown document.
    await updateContentMap(contentMap, dedupeWith(locationsForHover.map(l => l.uri).flat(), 'fsPath'))

    // Request hover for every (deduplicated) location range we got from def/type def/impl queries
    const hoverMap = new Map(
        // Dedupe the locations, we don't want to hover the same range twice
        dedupeWith(
            locationsForHover.filter(l => !isCommonImport(l.uri)),
            item => locationKeyFn(item)
        ).map(
            l =>
                [locationKeyFn(l), limiter(() => getHover(l.uri, l.range.start), abortSignal)] as [
                    string,
                    Thenable<vscode.Hover[]>,
                ]
        )
    )
    const resolvedHoverMap = await unwrapThenableMap(hoverMap)

    return Promise.all(
        hoverMatches.map(
            async ({
                symbolName,
                symbolLocation,
                definitionsPromise,
                typeDefinitionsPromise,
                implementationsPromise,
            }) => {
                let definitionObj: ResolvedHoverElement | undefined
                const definitionLocation = (await definitionsPromise).pop()
                if (definitionLocation) {
                    const symbolName = extractRangeFromDocument(
                        contentMap,
                        definitionLocation.uri,
                        definitionLocation.range
                    )

                    definitionObj = {
                        symbolName,
                        location: definitionLocation,
                        hover: resolvedHoverMap.get(locationKeyFn(definitionLocation)) || [],
                    }
                }

                let typeDefinitionObj: ResolvedHoverElement | undefined
                const typeDefinitionLocation = (await typeDefinitionsPromise).pop()
                if (typeDefinitionLocation) {
                    const symbolName = extractRangeFromDocument(
                        contentMap,
                        typeDefinitionLocation.uri,
                        typeDefinitionLocation.range
                    )

                    typeDefinitionObj = {
                        symbolName,
                        location: typeDefinitionLocation,
                        hover: resolvedHoverMap.get(locationKeyFn(typeDefinitionLocation)) || [],
                    }
                }

                let implementationObjs: ResolvedHoverElement[] | undefined
                const implementationsLocations = await implementationsPromise
                if (implementationsLocations.length > 0) {
                    implementationObjs = implementationsLocations.map(location => ({
                        symbolName: extractRangeFromDocument(contentMap, location.uri, location.range),
                        location,
                        hover: resolvedHoverMap.get(locationKeyFn(location)) || [],
                    }))
                }

                return {
                    symbolName,
                    symbolLocation,
                    definition: definitionObj,
                    typeDefinition: typeDefinitionObj,
                    implementations: implementationObjs,
                }
            }
        )
    )
}

const extractRangeFromDocument = (contentMap: Map<string, string[]>, uri: vscode.Uri, range: vscode.Range): string => {
    const content = contentMap.get(uri.fsPath)
    if (!content) {
        return ''
    }

    // Trim off lines outside of the range
    // NOTE: inclusive upper bound
    const extractedLines = content.slice(range.start.line, range.end.line + 1)
    if (extractedLines.length === 0) {
        return ''
    }

    // Trim off characters outside of the range
    const n = extractedLines.length - 1
    extractedLines[n] = extractedLines[n].slice(0, range.end.character)
    extractedLines[0] = extractedLines[0].slice(range.start.character)

    return extractedLines.join('\n')
}
/**
 * For each match, extract the definition text from the given map of file contents. The given content map
 * is expected to hold the contents of the file indicated by the definition's location URI, and the file
 * is assumed to be open in the current VSCode workspace. Matches without such an entry are skipped.
 */
export const extractDefinitionContexts = async (
    matches: { symbolName: string; hover: vscode.Hover[]; location: vscode.Location }[],
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
    for (const { symbolName, hover, location } of matches) {
        const { uri, range } = location
        const contentPromise = contentMap.get(uri.fsPath)
        const documentSymbolsPromises = documentSymbolsMap.get(uri.fsPath)

        if (contentPromise && documentSymbolsPromises) {
            const content = contentPromise
            const documentSymbols = await documentSymbolsPromises // NOTE: already resolved

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
                    hoverText: hover.flatMap(h => h.contents.map(c => (typeof c === 'string' ? c : c.value))),
                    definitionSnippet,
                })
            }
        }
    }

    return contexts
}

/**
 * Shim for default LSP executeDocumentSymbolProvider call. Can be mocked for testing.
 */
export const defaultGetDocumentSymbolRanges = async (uri: URI): Promise<vscode.Range[]> =>
    vscode.commands
        .executeCommand<(vscode.SymbolInformation | vscode.DocumentSymbol)[] | undefined>(
            'vscode.executeDocumentSymbolProvider',
            uri
        )
        .then(result => {
            if (!result) {
                return []
            }
            return result.map(extractSymbolRange)
        })

/**
 * Shim for default LSP executeHoverPRovider call. Can be mocked for testing.
 */
const defaultGetHover = async (uri: URI, position: vscode.Position): Promise<vscode.Hover[]> =>
    vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', uri, position)

/**
 * Shim for default LSP executeDefinitionProvider call. Can be mocked for testing.
 */
const defaultGetDefinitions = async (uri: URI, position: vscode.Position): Promise<vscode.Location[]> =>
    vscode.commands
        .executeCommand<(vscode.Location | vscode.LocationLink)[]>('vscode.executeDefinitionProvider', uri, position)
        .then(locations => locations.flatMap(extractLocation))

/**
 * Shim for default LSP executeTypeDefinitionProvider call. Can be mocked for testing.
 */
const defaultGetTypeDefinitions = async (uri: URI, position: vscode.Position): Promise<vscode.Location[]> =>
    vscode.commands
        .executeCommand<(vscode.Location | vscode.LocationLink)[]>(
            'vscode.executeTypeDefinitionProvider',
            uri,
            position
        )
        .then(locations => locations.flatMap(extractLocation))
        // Type definitions are not always well-defined for things like functions. In these cases
        // we'd like to fall back to a regular definition result which gives us the same class and
        // quality of information.
        .then(locations => (locations.length > 0 ? locations : defaultGetDefinitions(uri, position)))

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
 * Returns a key unique to a given location for use with `dedupeWith`.
 */
export const locationKeyFn = (location: vscode.Location): string =>
    `${location.uri?.fsPath}?L${location.range.start.line}:${location.range.start.character}`

/**
 * Convert a mapping from K -> Thenable<V> to a map of K -> V.
 */
const unwrapThenableMap = async <K, V>(map: Map<K, Thenable<V>>): Promise<Map<K, V>> => {
    const resolved = new Map<K, V>()
    for (const [k, v] of map) {
        resolved.set(k, await v)
    }
    return resolved
}
