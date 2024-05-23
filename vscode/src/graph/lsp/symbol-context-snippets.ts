import { LRUCache } from 'lru-cache'
import type * as vscode from 'vscode'

import {
    type AutocompleteContextSnippet,
    type AutocompleteSymbolContextSnippet,
    isDefined,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'

import { getLastNGraphContextIdentifiersFromString } from '../../completions/context/retrievers/graph/identifiers'
import { lines } from '../../completions/text-processing'
import { SupportedLanguage } from '../../tree-sitter/grammars'

import {
    IS_LSP_LIGHT_LOGGING_ENABLED,
    debugSymbol,
    flushLspLightDebugLogs,
    formatUriAndPosition,
    formatUriAndRange,
} from './debug-logger'
import { type ParsedHover, extractHoverContent, isUnhelpfulSymbolSnippet } from './hover'
import { commonKeywords, isCommonImport } from './languages'
import {
    getDefinitionLocations,
    getHover,
    getImplementationLocations,
    getLinesFromLocation,
    getTextFromLocation,
    getTypeDefinitionLocations,
    lspRequestLimiter,
} from './lsp-commands'

async function getParsedHovers(
    uri: vscode.Uri,
    position: vscode.Position,
    abortSignal: AbortSignal
): Promise<ParsedHover[]> {
    const hoverContent = await lspRequestLimiter(() => getHover(uri, position), abortSignal)
    return extractHoverContent(hoverContent)
}

const NESTED_IDENTIFIERS_TO_RESOLVE = 5
// For local testing purposes
export const IS_LSP_LIGHT_CACHE_DISABLED = process.env.LSP_LIGHT_CACHE_DISABLED === 'true'

export interface SymbolSnippetsRequest {
    symbolName: string
    uri: vscode.Uri
    position: vscode.Position
    nodeType: string
    languageId: string
}

interface SymbolSnippetWithContentResolved extends AutocompleteSymbolContextSnippet {
    key: DefinitionCacheEntryPath
    relatedDefinitionKeys?: Set<DefinitionCacheEntryPath>
    location: vscode.Location
}

type Optional<T, K extends keyof T> = { [key in K]: T[K] | undefined } & Omit<T, K>
type SymbolSnippetWithLocationResolved = Optional<SymbolSnippetWithContentResolved, 'content'>

interface GetSymbolSnippetForNodeTypeParams {
    symbolSnippetRequest: SymbolSnippetsRequest
    recursionLimit: number
    parentDefinitionCacheEntryPaths?: Set<DefinitionCacheEntryPath>
    abortSignal: AbortSignal
}

async function getSnippetForLocationGetter(
    locationGetter: typeof getDefinitionLocations,
    params: GetSymbolSnippetForNodeTypeParams
): Promise<SymbolSnippetWithLocationResolved | undefined> {
    const {
        recursionLimit,
        symbolSnippetRequest,
        symbolSnippetRequest: { uri, position, nodeType, symbolName, languageId },
        parentDefinitionCacheEntryPaths,
        abortSignal,
    } = params

    let definitionLocations = definitionLocationCache.get(symbolSnippetRequest)

    if (isEmptyCacheEntry(definitionLocations)) {
        return undefined
    }

    if (!definitionLocations) {
        definitionLocations = await lspRequestLimiter(() => locationGetter(uri, position))
    }

    // Sort for the narrowest definition range (e.g. used when we get full class implementation vs. constructor)
    const sortedDefinitionLocations = definitionLocations
        .sort((a, b) => {
            const bLines = b.range.start.line - b.range.end.line
            const aLines = a.range.start.line - a.range.end.line

            return bLines - aLines
        })
        .filter(location => !isCommonImport(location.uri))

    if (IS_LSP_LIGHT_LOGGING_ENABLED) {
        debugSymbol(
            symbolName,
            'definitionLocations',
            sortedDefinitionLocations.map(location => formatUriAndRange(location.uri, location.range))
        )
    }

    // TODO: support multiple definition locations
    const [definitionLocation] = sortedDefinitionLocations
    // const [definitionLocation] = definitionLocations

    if (definitionLocation === undefined) {
        return undefined
    }

    const { uri: definitionUri, range: definitionRange } = definitionLocation

    if (IS_LSP_LIGHT_LOGGING_ENABLED) {
        debugSymbol(symbolName, 'location', {
            nodeType,
            location: formatUriAndRange(definitionUri, definitionRange),
        })
    }

    const symbolContextSnippet = {
        key: `${definitionUri}::${definitionRange.start.line}:${definitionRange.start.character}`,
        uri: definitionUri,
        startLine: definitionRange.start.line,
        endLine: definitionRange.end.line,
        symbol: symbolName,
        location: definitionLocation,
        content: undefined,
    } satisfies SymbolSnippetWithLocationResolved

    const cachedDefinition = definitionCache.get(definitionLocation)
    if (cachedDefinition) {
        updateParentDefinitionKeys(parentDefinitionCacheEntryPaths, symbolContextSnippet)

        return {
            ...symbolContextSnippet,
            ...cachedDefinition,
        }
    }

    const debugResolutionSteps = []

    const [parsedHover] = await getParsedHovers(uri, position, abortSignal)
    let definitionString: string | undefined = parsedHover.text
    let hoverKind: string | undefined = parsedHover.kind
    let isHover = true

    debugResolutionSteps.push({
        type: 'getHover (current location)',
        definitionString,
        hoverKind,
    })

    if (isUnhelpfulSymbolSnippet(symbolName, definitionString)) {
        hoverKind = undefined
        isHover = false

        if (nodeType === 'type_identifier') {
            definitionString = await getTextFromLocation(definitionLocation)
            debugResolutionSteps.push({
                type: 'getTextFromLocation (definition location)',
                definitionString,
            })
        }

        if (isUnhelpfulSymbolSnippet(symbolName, definitionString)) {
            const [parsedHover] = await getParsedHovers(
                definitionLocation.uri,
                definitionLocation.range.start,
                abortSignal
            )

            definitionString = parsedHover.text
            hoverKind = parsedHover.kind
            isHover = true

            debugResolutionSteps.push({
                type: 'getHover (definition location)',
                definitionString,
                hoverKind: parsedHover.kind,
            })
        }
    }

    if (isUnhelpfulSymbolSnippet(symbolName, definitionString)) {
        hoverKind = undefined
        isHover = false

        definitionString = await getTextFromLocation(definitionLocation)
        debugResolutionSteps.push({
            why: 'unhelpful snippet',
            type: 'getTextFromLocation (definition location)',
            definitionString,
        })
    }

    if (
        !definitionString ||
        isUnhelpfulSymbolSnippet(symbolName, definitionString) ||
        lines(definitionString).length > 100
    ) {
        if (IS_LSP_LIGHT_LOGGING_ENABLED) {
            debugSymbol(symbolName, 'no helpful context found:', {
                hoverKind: hoverKind,
                definitionString,
                resolutions: debugResolutionSteps,
            })
        }

        return symbolContextSnippet
    }

    definitionLocationCache.set(symbolSnippetRequest, definitionLocations)
    definitionCache.set(definitionLocation, { content: definitionString })
    updateParentDefinitionKeys(parentDefinitionCacheEntryPaths, symbolContextSnippet)

    // TODO: the number of lines should be dynamic.
    // TODO: it should be possible to use `definitionString` if it's from `getTextFromLocation`.
    let nestedSymbolsSource = await getLinesFromLocation(definitionLocation, 10)

    if (isJavascript(languageId)) {
        // Hack: modify the source to allow tree-sitter to parse it properly.
        if (hoverKind === 'method') {
            nestedSymbolsSource = 'function ' + nestedSymbolsSource
        }

        // TODO: add a generic solution for class/object methods
        if (nestedSymbolsSource.trimStart().startsWith('constructor')) {
            nestedSymbolsSource = `{${nestedSymbolsSource}}`
        }
    }

    const initialNestedSymbolRequests = getLastNGraphContextIdentifiersFromString({
        n: NESTED_IDENTIFIERS_TO_RESOLVE,
        uri: definitionLocation.uri,
        languageId,
        source: nestedSymbolsSource,
        prioritize: 'head',
        // TODO: figure out the balance between the number of identifiers and empty
        // results caused by broken parse-trees for hover strings.
        // TODO: required for class property definitions
        // getAllIdentifiers: true,
    })

    const nestedSymbolRequests = initialNestedSymbolRequests
        .filter(request => {
            return (
                request.symbolName.length > 0 &&
                // exclude current symbol
                symbolName !== request.symbolName &&
                // exclude common symbols
                !commonKeywords.has(request.symbolName) &&
                // exclude symbols not preset in the definition string (if it's a hover string)
                (nestedSymbolsSource.includes('class') || definitionString.includes(request.symbolName))
            )
        })
        .map(request => {
            if (isHover) {
                return {
                    ...request,
                    position: request.position.translate({
                        lineDelta: definitionLocation.range.start.line,
                    }),
                }
            }

            return {
                ...request,
                position: request.position.translate({
                    lineDelta: definitionLocation.range.start.line,
                    characterDelta: definitionLocation.range.start.character,
                }),
            }
        })
        .filter(isDefined)

    if (IS_LSP_LIGHT_LOGGING_ENABLED) {
        debugSymbol(symbolName, 'nested symbols:', {
            hoverKind: hoverKind,
            definitionString,
            nestedSymbolsSource,
            resolutions: debugResolutionSteps,
            initialNestedSymbolRequests: initialNestedSymbolRequests.map(r => {
                return {
                    symbolName: r.symbolName,
                    position: formatUriAndPosition(r.uri, r.position),
                }
            }),
            nestedSymbolRequests: nestedSymbolRequests.map(r => {
                return {
                    symbolName: r.symbolName,
                    position: formatUriAndPosition(r.uri, r.position),
                }
            }),
        })
    }

    if (nestedSymbolRequests.length === 0) {
        return {
            ...symbolContextSnippet,
            content: definitionString,
        }
    }

    const definitionCacheEntry = {
        content: definitionString,
        relatedDefinitionKeys: new Set(),
    } satisfies DefinitionCacheEntry

    definitionCache.set(definitionLocation, definitionCacheEntry)

    await getSymbolContextSnippetsRecursive({
        symbolsSnippetRequests: nestedSymbolRequests,
        abortSignal,
        recursionLimit: recursionLimit - 1,
        parentDefinitionCacheEntryPaths: new Set([
            symbolContextSnippet.key,
            ...(parentDefinitionCacheEntryPaths || []),
        ]),
    })

    return {
        ...symbolContextSnippet,
        ...definitionCacheEntry,
    }
}

function updateParentDefinitionKeys(
    parentDefinitionCacheEntryPaths: GetSymbolSnippetForNodeTypeParams['parentDefinitionCacheEntryPaths'],
    symbolContextSnippet: SymbolSnippetWithLocationResolved
) {
    if (parentDefinitionCacheEntryPaths) {
        for (const parentDefinitionCacheEntryPath of parentDefinitionCacheEntryPaths) {
            const entry = definitionCache.getByPath(parentDefinitionCacheEntryPath)

            if (!isEmptyCacheEntry(entry)) {
                entry?.relatedDefinitionKeys?.add(symbolContextSnippet.key)
            }
        }
    }
}

interface GetSymbolContextSnippetsRecursive extends GetSymbolContextSnippetsParams {
    parentDefinitionCacheEntryPaths?: Set<DefinitionCacheEntryPath>
}

async function getSymbolContextSnippetsRecursive(
    params: GetSymbolContextSnippetsRecursive
): Promise<SymbolSnippetWithContentResolved[]> {
    const { symbolsSnippetRequests, recursionLimit, parentDefinitionCacheEntryPaths, abortSignal } =
        params

    if (recursionLimit === 0) {
        return []
    }

    const contextSnippets = await Promise.all(
        symbolsSnippetRequests.map(async symbolSnippetRequest => {
            const { nodeType, symbolName } = symbolSnippetRequest
            // await debugLSP(symbolSnippetRequest)

            let locationGetters = [
                getTypeDefinitionLocations,
                getDefinitionLocations,
                getImplementationLocations,
            ]
            if (['type_identifier'].includes(nodeType)) {
                locationGetters = [
                    getDefinitionLocations,
                    getTypeDefinitionLocations,
                    getImplementationLocations,
                ]
            }

            let symbolContextSnippet: SymbolSnippetWithLocationResolved | undefined
            for (const locationGetter of locationGetters) {
                if (IS_LSP_LIGHT_LOGGING_ENABLED) {
                    debugSymbol(symbolName, '---------------------------------------------------------')
                    debugSymbol(symbolName, `using locationGetter "${locationGetter.name}"`)
                }

                symbolContextSnippet = await getSnippetForLocationGetter(locationGetter, {
                    symbolSnippetRequest,
                    recursionLimit,
                    parentDefinitionCacheEntryPaths,
                    abortSignal,
                })

                // If we found a symbol snippet, we do not need to try any other location getters.
                if (symbolContextSnippet?.content !== undefined) {
                    break
                }
            }

            // If we did not find a symbol location, we should cache this as an empty
            // cache entry to avoid making redundant LSP calls later.
            if (!symbolContextSnippet) {
                definitionLocationCache.set(symbolSnippetRequest, EMPTY_CACHE_ENTRY)
                return undefined
            }

            // If we did not find a helpful symbol snippet, we should cache this as an empty
            // cache entry to avoid making redundant LSP calls later.
            if (symbolContextSnippet.content === undefined) {
                definitionCache.set(symbolContextSnippet.location, EMPTY_CACHE_ENTRY)
                return undefined
            }

            return symbolContextSnippet as SymbolSnippetWithContentResolved
        })
    )

    return contextSnippets.filter(isDefined)
}

export interface GetSymbolContextSnippetsParams {
    symbolsSnippetRequests: SymbolSnippetsRequest[]
    abortSignal: AbortSignal
    recursionLimit: number
}

export async function getSymbolContextSnippets(
    params: GetSymbolContextSnippetsParams
): Promise<AutocompleteContextSnippet[]> {
    const result = await wrapInActiveSpan('getSymbolContextSnippetsRecursive', () => {
        return getSymbolContextSnippetsRecursive(params)
    })

    const resultWithRelatedSnippets = result.flatMap(snippet => {
        if (!snippet.relatedDefinitionKeys) {
            return snippet
        }

        let relatedDefinitionKeys = Array.from(snippet.relatedDefinitionKeys?.values())

        if (process.env.VITEST) {
            // Sort related definition keys to keep test snapshots stable on CI.
            relatedDefinitionKeys = relatedDefinitionKeys.sort((a, b) => b.localeCompare(a))
        }

        const relatedDefinitions = relatedDefinitionKeys
            .map(key => {
                if (key === snippet.key) {
                    return undefined
                }

                const entry = definitionCache.getByPath(key)

                if (isEmptyCacheEntry(entry)) {
                    return undefined
                }

                return entry?.content
            })
            .filter(isDefined)

        return {
            ...snippet,
            content: [...relatedDefinitions, snippet.content].join('\n'),
        }
    })

    flushLspLightDebugLogs()
    return resultWithRelatedSnippets
}

const EMPTY_CACHE_ENTRY = { isEmptyCacheEntry: true } as const
function isEmptyCacheEntry(
    value?: DefinitionLocationCacheEntry | DefinitionCacheEntry
): value is typeof EMPTY_CACHE_ENTRY {
    return Boolean(value && 'isEmptyCacheEntry' in value)
}

interface DefinitionCacheEntryValue {
    content: string
    relatedDefinitionKeys?: Set<DefinitionCacheEntryPath>
}
type DefinitionCacheEntry = DefinitionCacheEntryValue | typeof EMPTY_CACHE_ENTRY

type LocationRangeStart = `${string}:${string}`
type UriString = string
type DefinitionCacheKey = LocationRangeStart
type DefinitionCacheEntryPath = `${UriString}::${DefinitionCacheKey}`

type DefinitionLocationCacheKey = string
type DefinitionLocationCacheEntryPath = `${UriString}::${DefinitionLocationCacheKey}`
type DefinitionLocationCacheEntry = vscode.Location[] | typeof EMPTY_CACHE_ENTRY

const MAX_CACHED_DOCUMENTS = 100
const MAX_CACHED_DEFINITION_LOCATIONS = 100
const MAX_CACHED_DEFINITIONS = 100

/**
 * Two level cache: document -> definition position -> definition.
 */
class DefinitionCache {
    private isDisabled = IS_LSP_LIGHT_CACHE_DISABLED
    public cache = new LRUCache<UriString, LRUCache<DefinitionCacheKey, DefinitionCacheEntry>>({
        max: MAX_CACHED_DOCUMENTS,
    })

    public toDefinitionCacheKey(location: vscode.Location): DefinitionCacheKey {
        return `${location.range.start.line}:${location.range.start.character}`
    }

    public get(location: vscode.Location): DefinitionCacheEntry | undefined {
        if (this.isDisabled) {
            return undefined
        }

        const documentCache = this.cache.get(location.uri.toString())
        if (!documentCache) {
            return undefined
        }

        return documentCache.get(this.toDefinitionCacheKey(location))
    }

    public getByPath(path: DefinitionCacheEntryPath): DefinitionCacheEntry | undefined {
        const [uri, key] = path.split('::')
        return this.cache.get(uri)?.get(key as DefinitionCacheKey)
    }

    public set(location: vscode.Location, locations: DefinitionCacheEntry): void {
        const uri = location.uri.toString()
        let documentCache = this.cache.get(uri)
        if (!documentCache) {
            documentCache = new LRUCache({
                max: MAX_CACHED_DEFINITIONS,
            })
            this.cache.set(uri, documentCache)
        }

        documentCache.set(this.toDefinitionCacheKey(location), locations)
    }

    public delete(location: vscode.Location): void {
        const documentCache = this.cache.get(location.uri.toString())

        if (documentCache) {
            documentCache.delete(this.toDefinitionCacheKey(location))
        }
    }

    public deleteDocument(uri: string) {
        this.cache.delete(uri)
    }
}

const definitionCache = new DefinitionCache()

/**
 * Two level cache: document uri -> symbol snippet request key -> definition locations.
 *
 * We assume the symbol snippet request guarantees that it won't become stale. In practice,
 * it can happen if the user changes the import statement path without changing the
 * symbol name, type, and position. The probability of this happening is low,
 * so the benefit outweighs the risk.
 */
class DefinitionLocationCache {
    private isDisabled = IS_LSP_LIGHT_CACHE_DISABLED
    public cache = new LRUCache<
        UriString,
        LRUCache<DefinitionLocationCacheKey, DefinitionLocationCacheEntry>
    >({
        max: MAX_CACHED_DOCUMENTS,
    })

    /**
     * Keeps track of the cache keys for each document so that we can quickly
     * invalidate the cache when a document is changed.
     */
    public documentToLocationCacheKeyMap = new Map<UriString, Set<DefinitionLocationCacheEntryPath>>()

    public toDefinitionLocationCacheKey(request: SymbolSnippetsRequest): DefinitionLocationCacheKey {
        const { position, nodeType, symbolName } = request
        return `${position.line}:${position.character}:${nodeType}:${symbolName}`
    }

    public get(request: SymbolSnippetsRequest): DefinitionLocationCacheEntry | undefined {
        if (this.isDisabled) {
            return undefined
        }

        const documentCache = this.cache.get(request.uri.toString())
        if (!documentCache) {
            return undefined
        }

        return documentCache.get(this.toDefinitionLocationCacheKey(request))
    }

    public set(request: SymbolSnippetsRequest, value: DefinitionLocationCacheEntry): void {
        const uri = request.uri.toString()
        let documentCache = this.cache.get(uri)
        if (!documentCache) {
            documentCache = new LRUCache({
                max: MAX_CACHED_DEFINITION_LOCATIONS,
            })
            this.cache.set(uri, documentCache)
        }

        const locationCacheKey = this.toDefinitionLocationCacheKey(request)
        documentCache.set(locationCacheKey, value)

        if (!isEmptyCacheEntry(value)) {
            for (const location of value) {
                this.addToDocumentToCacheKeyMap(location.uri.toString(), `${uri}::${locationCacheKey}`)
            }
        }
    }

    public delete(request: SymbolSnippetsRequest): void {
        const documentCache = this.cache.get(request.uri.toString())

        if (documentCache) {
            documentCache.delete(this.toDefinitionLocationCacheKey(request))
        }
    }

    addToDocumentToCacheKeyMap(uri: string, cacheKey: DefinitionLocationCacheEntryPath) {
        if (!this.documentToLocationCacheKeyMap.has(uri)) {
            this.documentToLocationCacheKeyMap.set(uri, new Set())
        }
        this.documentToLocationCacheKeyMap.get(uri)!.add(cacheKey)
    }

    removeFromDocumentToCacheKeyMap(uri: string, cacheKey: DefinitionLocationCacheEntryPath) {
        if (this.documentToLocationCacheKeyMap.has(uri)) {
            this.documentToLocationCacheKeyMap.get(uri)!.delete(cacheKey)
            if (this.documentToLocationCacheKeyMap.get(uri)!.size === 0) {
                this.documentToLocationCacheKeyMap.delete(uri)
            }
        }
    }

    invalidateEntriesForDocument(uri: string) {
        if (this.documentToLocationCacheKeyMap.has(uri)) {
            const cacheKeysToRemove = this.documentToLocationCacheKeyMap.get(uri)!
            for (const cacheKey of cacheKeysToRemove) {
                const [uri, key] = cacheKey.split('::')
                this.cache.get(uri)?.delete(key)
                this.removeFromDocumentToCacheKeyMap(uri, cacheKey)
            }
        }
    }
}

const definitionLocationCache = new DefinitionLocationCache()

export function invalidateDocumentCache(document: vscode.TextDocument) {
    const uriString = document.uri.toString()

    // Remove cache items that depend on the updated document
    definitionCache.deleteDocument(uriString)
    definitionLocationCache.invalidateEntriesForDocument(uriString)
}

// TODO: make the incremental symbol resolution work with caching. The integration test snapshots should be updated
// after that. Currently if nested symbols are not resolved because of the recursion limit, the are never resolved.
export function clearLspCacheForTests() {
    definitionCache.cache.clear()
    definitionLocationCache.cache.clear()
    definitionLocationCache.documentToLocationCacheKeyMap.clear()
}

function isJavascript(languageId: string) {
    return [
        SupportedLanguage.javascript,
        SupportedLanguage.typescript,
        SupportedLanguage.javascriptreact,
        SupportedLanguage.typescriptreact,
    ].includes(languageId as SupportedLanguage)
}
