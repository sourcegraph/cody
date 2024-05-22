import { LRUCache } from 'lru-cache'
import * as vscode from 'vscode'

import {
    type AutocompleteContextSnippet,
    type AutocompleteSymbolContextSnippet,
    isDefined,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'

import { getLastNGraphContextIdentifiersFromString } from '../../completions/context/retrievers/graph/identifiers'
import { lines } from '../../completions/text-processing'
import {
    debugSymbol,
    flushLspLightDebugLogs,
    formatUriAndPosition,
    formatUriAndRange,
} from './debug-logger'
import { extractHoverContent, isUnhelpfulSymbolSnippet } from './hover'
import { commonKeywords, isCommonImport } from './languages'
import { createLimiter } from './limiter'
import {
    getDefinitionLocations,
    getHover,
    getImplementationLocations,
    getTextFromLocation,
    getTypeDefinitionLocations,
} from './lsp-commands'

const lspRequestLimiter = createLimiter({
    // The concurrent requests limit is chosen very conservatively to avoid blocking the language
    // server.
    limit: 3,
    // If any language server API takes more than 2 seconds to answer, we should cancel the request
    timeout: 2000,
})

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

    const sortedDefinitionLocations = definitionLocations.sort((a, b) => {
        const bLines = b.range.start.line - b.range.end.line
        const aLines = a.range.start.line - a.range.end.line

        return bLines - aLines
    })

    debugSymbol(
        symbolName,
        'definitionLocations',
        sortedDefinitionLocations.map(location => formatUriAndRange(location.uri, location.range))
    )

    // Sort for the narrowest definition range (e.g. used when we get full class implementation vs. constructor)
    const [definitionLocation] = sortedDefinitionLocations
    // const [definitionLocation] = definitionLocations

    if (
        definitionLocation === undefined ||
        (definitionLocation && isCommonImport(definitionLocation.uri))
    ) {
        return undefined
    }

    const { uri: definitionUri, range: definitionRange } = definitionLocation
    debugSymbol(symbolName, 'location', {
        nodeType,
        location: formatUriAndRange(definitionUri, definitionRange),
    })

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

    let definitionString: string | undefined
    let definitionHover: string | undefined
    let isHover = false
    let hoverKind: string | undefined
    const resolutions = []
    let shouldReturn = false

    const hoverContent = await lspRequestLimiter(() => getHover(uri, position), abortSignal)
    const [{ text, kind } = { text: '', kind: undefined }] = extractHoverContent(hoverContent) || [{}]

    definitionString = text
    hoverKind = kind
    isHover = true

    resolutions.push({
        type: 'getHover (initial)',
        definitionString,
        hoverKind: kind,
    })

    if (isUnhelpfulSymbolSnippet(symbolName, definitionString)) {
        definitionString = ''
        hoverKind = undefined
        isHover = false
        if (nodeType === 'type_identifier') {
            // TODO: add fallback here for unhelpful symbol snippets. Can happen if LSP lacks the
            // location-links capability
            definitionString = await getTextFromLocation(definitionLocation)
            resolutions.push({
                type: 'getTextFromLocation',
                definitionString,
            })
        } else {
            const hoverContent = await lspRequestLimiter(
                () => getHover(definitionLocation.uri, definitionLocation.range.start),
                abortSignal
            )
            const [{ text, kind } = { text: '', kind: undefined }] = extractHoverContent(
                hoverContent
            ) || [{}]

            definitionString = text
            hoverKind = kind
            isHover = true

            resolutions.push({
                type: 'getHover',
                definitionString,
                hoverKind: kind,
            })
        }
    }

    if (isUnhelpfulSymbolSnippet(symbolName, definitionString)) {
        isHover = false
        definitionString = await getTextFromLocation(definitionLocation)
        resolutions.push({
            why: 'unhelpful snippet',
            type: 'getTextFromLocation',
            definitionString,
        })

        if (definitionString === `class ${symbolName}`) {
            // Handle class constructors
            const hoverContent = await lspRequestLimiter(
                () => getHover(symbolSnippetRequest.uri, symbolSnippetRequest.position),
                abortSignal
            )
            const [{ text, kind } = { text: '', kind: undefined }] = extractHoverContent(hoverContent)
            definitionString = text
            hoverKind = kind
            isHover = true

            resolutions.push({
                why: 'unhelpful class snippet',
                type: 'getHover',
                definitionString,
                hoverKind: kind,
            })

            if (isUnhelpfulSymbolSnippet(symbolName, definitionString)) {
                shouldReturn = true
            }
        } else if (isUnhelpfulSymbolSnippet(symbolName, definitionString)) {
            shouldReturn = true
        }
    }

    if (lines(definitionString).length > 100) {
        shouldReturn = true
    }

    if (shouldReturn) {
        debugSymbol(symbolName, 'no helpful context found:', {
            hoverKind: hoverKind,
            definitionHover,
            definitionString,
            resolutions,
        })

        return symbolContextSnippet
    }

    definitionLocationCache.set(symbolSnippetRequest, definitionLocations)
    definitionCache.set(definitionLocation, { content: definitionString })
    updateParentDefinitionKeys(parentDefinitionCacheEntryPaths, symbolContextSnippet)

    // TODO: required only for hover definitions
    const definitionDocument = await vscode.workspace.openTextDocument(definitionLocation.uri)
    let definitionFirstLines = definitionDocument.getText(
        new vscode.Range(
            new vscode.Position(definitionLocation.range.start.line, 0),
            // TODO: number of lines should depend on the definitionString length
            new vscode.Position(definitionLocation.range.start.line + 10, 0)
        )
    )

    if (hoverKind === 'method') {
        definitionFirstLines = 'function ' + definitionFirstLines
    }

    // TODO: add a generic solution for class/object methods
    if (definitionFirstLines.trimStart().startsWith('constructor')) {
        definitionFirstLines = `{${definitionFirstLines}}`
    }

    const initialNestedSymbolRequests = getLastNGraphContextIdentifiersFromString({
        n: NESTED_IDENTIFIERS_TO_RESOLVE,
        uri: definitionLocation.uri,
        languageId,
        source: definitionFirstLines,
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
                (definitionFirstLines.includes('class') || definitionString.includes(request.symbolName))
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

    debugSymbol(symbolName, 'nested symbols:', {
        hoverKind: hoverKind,
        definitionHover,
        definitionString,
        definitionFirstLines,
        resolutions,
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
                debugSymbol(symbolName, '-------------------------------------------------------------')
                debugSymbol(symbolName, `using locationGetter "${locationGetter.name}"`)

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

        const relatedDefinitions = Array.from(snippet.relatedDefinitionKeys?.values())
            .flatMap(key => {
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

interface DefinitionCacheEntryValue {
    content: string
    relatedDefinitionKeys?: Set<DefinitionCacheEntryPath>
}
type DefinitionCacheEntry = DefinitionCacheEntryValue | typeof EMPTY_CACHE_ENTRY

type LocationRangeStart = `${string}:${string}`
type UriString = string
type DefinitionCacheKey = LocationRangeStart
type DefinitionCacheEntryPath = `${UriString}::${DefinitionCacheKey}`
type LocationCacheKey = string
type LocationCacheEntryPath = `${UriString}::${LocationCacheKey}`

const MAX_CACHED_DOCUMENTS = 100
const MAX_CACHED_DEFINITION_LOCATIONS = 100
const MAX_CACHED_DEFINITIONS = 100

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

const EMPTY_CACHE_ENTRY = { isEmptyCacheEntry: true } as const
type DefinitionLocationCacheEntry = vscode.Location[] | typeof EMPTY_CACHE_ENTRY

function isEmptyCacheEntry(
    value?: DefinitionLocationCacheEntry | DefinitionCacheEntry
): value is typeof EMPTY_CACHE_ENTRY {
    return Boolean(value && 'isEmptyCacheEntry' in value)
}

class DefinitionLocationCache {
    private isDisabled = IS_LSP_LIGHT_CACHE_DISABLED
    public cache = new LRUCache<UriString, LRUCache<LocationCacheKey, DefinitionLocationCacheEntry>>({
        max: MAX_CACHED_DOCUMENTS,
    })

    /**
     * Keeps track of the cache keys for each document so that we can quickly
     * invalidate the cache when a document is changed.
     */
    public documentToLocationCacheKeyMap = new Map<UriString, Set<LocationCacheEntryPath>>()

    public toLocationCacheKey(request: SymbolSnippetsRequest): LocationCacheKey {
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

        return documentCache.get(this.toLocationCacheKey(request))
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

        const locationCacheKey = this.toLocationCacheKey(request)
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
            documentCache.delete(this.toLocationCacheKey(request))
        }
    }

    addToDocumentToCacheKeyMap(uri: string, cacheKey: LocationCacheEntryPath) {
        if (!this.documentToLocationCacheKeyMap.has(uri)) {
            this.documentToLocationCacheKeyMap.set(uri, new Set())
        }
        this.documentToLocationCacheKeyMap.get(uri)!.add(cacheKey)
    }

    removeFromDocumentToCacheKeyMap(uri: string, cacheKey: LocationCacheEntryPath) {
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
// after that. Currently if symbols are not resolved because of the nested identifiers limit, the are never resolved.
export function clearLspCacheForTests() {
    definitionCache.cache.clear()
    definitionLocationCache.cache.clear()
    definitionLocationCache.documentToLocationCacheKeyMap.clear()
}
