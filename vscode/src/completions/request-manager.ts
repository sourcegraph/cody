import { isEqual, partition } from 'lodash'
import { LRUCache } from 'lru-cache'
import type * as vscode from 'vscode'

import {
    type AutocompleteContextSnippet,
    type DocumentContext,
    isDefined,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'

import { addAutocompleteDebugEvent } from '../services/open-telemetry/debug-utils'

import levenshtein from 'js-levenshtein'
import { logDebug } from '../log'
import {
    InlineCompletionsResultSource,
    type LastInlineCompletionCandidate,
} from './get-inline-completions'
import { type CompletionLogID, logCompletionBookkeepingEvent } from './logger'
import { STOP_REASON_HOT_STREAK } from './providers/hot-streak'
import type {
    CompletionProviderTracer,
    GenerateCompletionsOptions,
    Provider,
} from './providers/provider'
import { reuseLastCandidate } from './reuse-last-candidate'
import { getPrevNonEmptyLineIndex, lines, removeIndentation } from './text-processing'
import {
    type InlineCompletionItemWithAnalytics,
    processInlineCompletions,
} from './text-processing/process-inline-completions'
import { forkSignal } from './utils'

export interface RequestParams {
    /** The request's document */
    document: vscode.TextDocument

    /** The request's document context */
    docContext: DocumentContext

    /** The state of the completion info box */
    selectedCompletionInfo: vscode.SelectedCompletionInfo | undefined

    /** The cursor position in the source file where the completion request was triggered. */
    position: vscode.Position

    /** The abort signal for the request. */
    abortSignal?: AbortSignal
}

export interface RequestManagerResult {
    completions: InlineCompletionItemWithAnalytics[]
    source: InlineCompletionsResultSource
    isFuzzyMatch: boolean
    updatedLogId?: CompletionLogID
}

interface RequestsManagerParams {
    providerOptions: GenerateCompletionsOptions
    requestParams: RequestParams
    provider: Provider
    context: AutocompleteContextSnippet[]
    isCacheEnabled: boolean
    logId: CompletionLogID
    isPreloadRequest: boolean
    tracer?: CompletionProviderTracer
}

/**
 * This class can handle concurrent requests for code completions. The idea is
 * that requests are not cancelled even when the user continues typing in the
 * document. This allows us to cache the results of expensive completions and
 * return them when the user triggers a completion again.
 *
 * It also retests the request against the completion result of an inflight
 * request that just resolved and uses the last candidate logic to synthesize
 * completions if possible.
 */
export class RequestManager {
    private cache = new RequestCache()
    private readonly inflightRequests: Set<InflightRequest> = new Set()
    // Tracks the last request that the request manager is called with. We use this to evaluate
    // the relevance of existing requests (i.e to find out if the generations are still relevant)
    private latestRequestParams: null | RequestsManagerParams = null

    public checkCache(
        params: Pick<RequestsManagerParams, 'requestParams' | 'isCacheEnabled'>
    ): RequestManagerResult | null {
        const { requestParams, isCacheEnabled } = params
        const cachedCompletions = this.cache.get(requestParams)

        if (isCacheEnabled && cachedCompletions) {
            addAutocompleteDebugEvent('RequestManager.checkCache', { cachedCompletions })
            return cachedCompletions
        }
        return null
    }

    public getMatchingInflightRequest(
        params: Pick<RequestsManagerParams, 'requestParams'>
    ): InflightRequest | undefined {
        const currentRequestParams = params.requestParams

        for (const request of this.inflightRequests) {
            const inflightParams = request.params

            const isSameRequest =
                isEqual(inflightParams.docContext, currentRequestParams.docContext) &&
                inflightParams.document.uri.toString() ===
                    currentRequestParams.document.uri.toString() &&
                inflightParams.position.isEqual(currentRequestParams.position)

            if (isSameRequest) {
                return request
            }
        }

        return undefined
    }

    public async request(params: RequestsManagerParams): Promise<RequestManagerResult> {
        if (!params.isPreloadRequest) {
            this.latestRequestParams = params
        }

        const { requestParams, provider, providerOptions, context, tracer, logId } = params

        addAutocompleteDebugEvent('RequestManager.request')

        // When request recycling is enabled, we do not pass the original abort signal forward as to
        // not interrupt requests that are no longer relevant. Instead, we let all previous requests
        // complete and try to see if their results can be reused for other inflight requests.
        const abortController: AbortController = params.requestParams.abortSignal
            ? forkSignal(params.requestParams.abortSignal)
            : new AbortController()

        const request = new InflightRequest(requestParams, abortController)
        this.inflightRequests.add(request)

        const generateCompletions = async (): Promise<void> => {
            try {
                for await (const fetchCompletionResults of provider.generateCompletions(
                    providerOptions,
                    request.abortController.signal,
                    context,
                    tracer
                )) {
                    const [hotStreakCompletions, currentCompletions] = partition(
                        fetchCompletionResults.filter(isDefined),
                        result => result.completion.stopReason === STOP_REASON_HOT_STREAK
                    )

                    addAutocompleteDebugEvent('RequestManager.request.yield', {
                        hotStreakCompletions: hotStreakCompletions.map(c => c.completion.insertText),
                        currentCompletions: currentCompletions.map(c => c.completion.insertText),
                    })

                    if (currentCompletions.length > 0) {
                        // Process regular completions that will shown to the user.
                        const completions = currentCompletions.map(result => result.completion)

                        // Shared post-processing logic
                        const processedCompletions = wrapInActiveSpan(
                            'autocomplete.shared-post-process',
                            () => processInlineCompletions(completions, requestParams)
                        )

                        // Cache even if the request was aborted or already fulfilled.
                        this.cache.set(requestParams, {
                            completions: processedCompletions,
                            source: InlineCompletionsResultSource.Cache,
                        })

                        // A promise will never resolve twice, so we do not need to
                        // check if the request was already fulfilled.
                        request.resolve({
                            completions: processedCompletions,
                            source: InlineCompletionsResultSource.Network,
                            isFuzzyMatch: false,
                        })

                        request.lastCompletions = processedCompletions

                        this.testIfResultCanBeRecycledForInflightRequests(
                            request,
                            processedCompletions,
                            logId
                        )
                    }

                    // Save hot streak completions for later use.
                    for (const result of hotStreakCompletions) {
                        request.lastRequestParams = {
                            ...request.lastRequestParams,
                            docContext: result.docContext,
                        }
                        request.lastCompletions = [result.completion]
                        this.cache.set(
                            { docContext: result.docContext },
                            {
                                completions: [result.completion],
                                source: InlineCompletionsResultSource.HotStreak,
                            }
                        )
                    }

                    this.cancelIrrelevantRequests()
                }
            } catch (error) {
                request.reject(error as Error)
            } finally {
                this.inflightRequests.delete(request)
            }
        }

        this.cancelIrrelevantRequests()

        void wrapInActiveSpan('autocomplete.generate', generateCompletions)
        return request.promise
    }

    public removeFromCache(params: RequestParams): void {
        this.cache.delete(params)
    }

    /**
     * Test if the result can be used for inflight requests. This only works
     * if a completion is a forward-typed version of a previous completion.
     */
    private testIfResultCanBeRecycledForInflightRequests(
        resolvedRequest: InflightRequest,
        items: InlineCompletionItemWithAnalytics[],
        logId: CompletionLogID
    ): void {
        const { document, position, docContext, selectedCompletionInfo } = resolvedRequest.params
        const lastCandidate: LastInlineCompletionCandidate = {
            uri: document.uri,
            lastTriggerPosition: position,
            lastTriggerDocContext: docContext,
            lastTriggerSelectedCompletionInfo: selectedCompletionInfo,
            result: {
                logId,
                source: InlineCompletionsResultSource.Network,
                items,
            },
        }

        for (const request of this.inflightRequests) {
            if (request === resolvedRequest) {
                continue
            }

            if (request.params.document.uri.toString() !== document.uri.toString()) {
                continue
            }

            const synthesizedCandidate = reuseLastCandidate({
                document: request.params.document,
                position: request.params.position,
                lastCandidate,
                docContext: request.params.docContext,
                selectedCompletionInfo: request.params.selectedCompletionInfo,
            })

            if (synthesizedCandidate) {
                const synthesizedItems = synthesizedCandidate.items

                logCompletionBookkeepingEvent('synthesizedFromParallelRequest')
                request.resolve({
                    completions: synthesizedItems,
                    source: InlineCompletionsResultSource.CacheAfterRequestStart,
                    isFuzzyMatch: false,
                    // Re-use the logId, so we do not log this as a separate completion.
                    updatedLogId: synthesizedCandidate.logId,
                })
                request.abortController.abort()
                this.inflightRequests.delete(request)
            }
        }
    }

    private cancelIrrelevantRequests(): void {
        if (!this.latestRequestParams) {
            return
        }

        const isLocalProvider = this.latestRequestParams.provider.mayUseOnDeviceInference

        for (const request of this.inflightRequests) {
            let shouldAbort = !computeIfRequestStillRelevant(
                this.latestRequestParams.requestParams,
                request.lastRequestParams,
                request.lastCompletions
            )

            if (isLocalProvider) {
                shouldAbort =
                    this.latestRequestParams.requestParams.docContext.currentLinePrefix !==
                    request.params.docContext.currentLinePrefix
            }

            if (shouldAbort) {
                logDebug('AutocompleteProvider', 'Irrelevant request aborted')
                request.abortController.abort()
                this.inflightRequests.delete(request)
            }
        }
    }
}

class InflightRequest {
    public promise: Promise<RequestManagerResult>
    public resolve: (result: RequestManagerResult) => void
    public reject: (error: Error) => void

    // Remember the latest completion candidates emitted by an inflight request. This is necessary
    // since we want to detect when a completion generation is diverging from the current document
    // context in order to effectively abort it.
    public lastCompletions: InlineCompletionItemWithAnalytics[] | null = null
    public lastRequestParams: RequestParams

    constructor(
        public params: RequestParams,
        public abortController: AbortController
    ) {
        // The promise constructor is called synchronously, so this is just to
        // make TS happy
        this.resolve = () => {}
        this.reject = () => {}

        this.lastRequestParams = params

        this.promise = new Promise<RequestManagerResult>((res, rej) => {
            this.resolve = res
            this.reject = rej
        })
    }
}

interface RequestCacheItem {
    completions: InlineCompletionItemWithAnalytics[]
    source: InlineCompletionsResultSource
}

interface CacheKey {
    prefixWithoutLastNLines: string
    prevNonEmptyLines: string[]
    currentLinePrefix: string
    nextNonEmptyLine: string
}

type CacheEntry = { key: CacheKey; value: RequestCacheItem }

class RequestCache {
    private cache = new LRUCache<string, CacheEntry>({
        max: 250,
    })

    /**
     * The base allowed Levenshtein distance between lines to match.
     */
    private levenshteinBaseThreshold = 3
    /**
     * The maximum allowed Levenshtein distance between lines to match.
     */
    private levenshteinMaxThreshold = 5
    /**
     * The number of lines to fuzzy match.
     */
    private fuzzyPrefixMatchLineCount = 5

    private toCacheKey(requestParams: Pick<RequestParams, 'docContext'>): CacheKey {
        const { prefix, currentLinePrefix, nextNonEmptyLine } = requestParams.docContext

        const prefixWithoutCurrentLinePrefix = (
            currentLinePrefix.length ? prefix.slice(0, -currentLinePrefix.length) : prefix
        ).trim()

        const prevNonEmptyLines: string[] = []
        let remainingPrefix = prefixWithoutCurrentLinePrefix

        for (let i = 0; i < this.fuzzyPrefixMatchLineCount; i++) {
            let lastNewLineIndex = getPrevNonEmptyLineIndex(remainingPrefix)
            if (lastNewLineIndex === null) {
                lastNewLineIndex = 0
            }

            const prevNonEmptyLine = remainingPrefix.slice(lastNewLineIndex)
            prevNonEmptyLines.unshift(prevNonEmptyLine)
            remainingPrefix = remainingPrefix.slice(0, -prevNonEmptyLine.length).trim()

            if (lastNewLineIndex === 0) {
                break
            }
        }

        return {
            prefixWithoutLastNLines: remainingPrefix,
            prevNonEmptyLines,
            currentLinePrefix,
            nextNonEmptyLine,
        }
    }

    private serializeCacheKey(key: CacheKey): string {
        return `${key.prefixWithoutLastNLines}\n${key.prevNonEmptyLines.join('\n')}\n${
            key.currentLinePrefix
        }█\n${key.nextNonEmptyLine}`
    }

    private getDynamicThreshold(str: string): number {
        // Empirically picked number to increase the maximum threshold for long strings.
        const lengthFactor = Math.floor(str.length / 20)
        return Math.min(this.levenshteinBaseThreshold + lengthFactor, this.levenshteinMaxThreshold)
    }

    public get(requestParams: RequestParams): RequestManagerResult | undefined {
        const cacheKey = this.toCacheKey(requestParams)
        const cacheKeyString = this.serializeCacheKey(cacheKey)

        const exactMatch = this.cache.get(cacheKeyString)
        if (exactMatch) {
            return { ...exactMatch.value, isFuzzyMatch: false }
        }

        // If no exact match found, look for a close match using levenshtein distance.
        // This is useful for cases when previous lines have minor changes
        // like added semicolons or extra spaces.
        for (const entry of this.cache.values() as Generator<CacheEntry | undefined>) {
            if (
                entry &&
                entry.key.prefixWithoutLastNLines === cacheKey.prefixWithoutLastNLines &&
                entry.key.currentLinePrefix === cacheKey.currentLinePrefix &&
                entry.key.nextNonEmptyLine === cacheKey.nextNonEmptyLine &&
                entry.key.prevNonEmptyLines.length === cacheKey.prevNonEmptyLines.length
            ) {
                const allLinesMatch = entry.key.prevNonEmptyLines.every((line, index) => {
                    const threshold = this.getDynamicThreshold(line)
                    const distance = levenshtein(line, cacheKey.prevNonEmptyLines[index])
                    return distance <= threshold
                })

                if (allLinesMatch) {
                    return {
                        ...entry.value,
                        isFuzzyMatch: true,
                    }
                }
            }
        }

        return undefined
    }

    public set(requestParams: Pick<RequestParams, 'docContext'>, item: RequestCacheItem): void {
        const cacheKey = this.toCacheKey(requestParams)
        const hashKey = this.serializeCacheKey(cacheKey)
        this.cache.set(hashKey, { key: cacheKey, value: item })
    }

    public delete(requestParams: RequestParams): void {
        const hashKey = this.serializeCacheKey(this.toCacheKey(requestParams))
        this.cache.delete(hashKey)
    }
}

// Given the current document and a previous request with it's recommended completions, compute if
// the completion is still relevant for the current document.
//
// We define a completion suggestion as still relevant if the prefix still overlap with the new new
// completion while allowing for some slight changes to account for prefixes.
export function computeIfRequestStillRelevant(
    currentRequest: Pick<RequestParams, 'docContext'> & { document: { uri: vscode.Uri } },
    previousRequest: Pick<RequestParams, 'docContext'> & { document: { uri: vscode.Uri } },
    completions: InlineCompletionItemWithAnalytics[] | null
): boolean {
    if (currentRequest.document.uri.toString() !== previousRequest.document.uri.toString()) {
        return false
    }

    const currentPrefixStartLine =
        currentRequest.docContext.position.line - (lines(currentRequest.docContext.prefix).length - 1)
    const previousPrefixStartLine =
        previousRequest.docContext.position.line - (lines(previousRequest.docContext.prefix).length - 1)

    const sharedStartLine = Math.max(currentPrefixStartLine, previousPrefixStartLine)

    // Truncate both prefixes to ensure they start at the same line
    const currentPrefixDiff = sharedStartLine - currentPrefixStartLine
    const previousPrefixDiff = sharedStartLine - previousPrefixStartLine
    if (currentPrefixDiff < 0 || previousPrefixDiff < 0) {
        // There is no overlap in prefixes, the completions are not relevant
        return false
    }
    const currentPrefix = currentRequest.docContext.prefix
        .split('\n')
        .slice(currentPrefixDiff)
        .join('\n')

    const previousPrefix = previousRequest.docContext.prefix
        .split('\n')
        .slice(previousPrefixDiff)
        .join('\n')

    // Require some overlap in the prefixes
    if (currentPrefix === '' || previousPrefix === '') {
        return false
    }

    const current = removeIndentation(currentPrefix)
    for (const completion of completions ?? [{ insertText: '' }]) {
        const inserted = removeIndentation(previousPrefix + completion.insertText)

        const isFullContinuation = inserted.startsWith(current) || current.startsWith(inserted)
        // We consider a completion still relevant if the prefixes and the continuation diverge up
        // to three characters. For this, we only consider typos in the last line (= the line at the
        // cursor position)
        const [insertedLines, insertedLastLine] = splitLastLine(inserted)
        const [currentLines, currentLastLine] = splitLastLine(current)
        const isTypo =
            insertedLines === currentLines && insertedLastLine.startsWith(currentLastLine.slice(0, -3))

        if (isFullContinuation || isTypo) {
            return true
        }
    }

    return false
}

function splitLastLine(text: string): [string, string] {
    const lines = text.split('\n')
    const lastLine = lines.pop()!
    return [lines.join('\n'), lastLine]
}
