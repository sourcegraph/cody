import { isError } from 'lodash'
import isEqual from 'lodash/isEqual'
import { LRUCache } from 'lru-cache'
import type { Observable } from 'observable-fns'
import { RE2JS as RE2 } from 're2js'
import type * as vscode from 'vscode'
import { currentAuthStatus } from '../auth/authStatus'
import { isFileURI } from '../common/uri'
import { cenv } from '../configuration/environment'
import { logDebug, logError } from '../logger'
import { fromVSCodeEvent } from '../misc/observable'
import { isDotCom } from '../sourcegraph-api/environments'
import { graphqlClient } from '../sourcegraph-api/graphql'
import {
    type CodyContextFilterItem,
    type ContextFilters,
    EXCLUDE_EVERYTHING_CONTEXT_FILTERS,
    INCLUDE_EVERYTHING_CONTEXT_FILTERS,
    type RefetchIntervalHint,
    TRANSIENT_REFETCH_INTERVAL_HINT,
} from '../sourcegraph-api/graphql/client'
import { wrapInActiveSpan } from '../tracing'
import { createSubscriber } from '../utils'

interface ParsedContextFilters {
    include: null | ParsedContextFilterItem[]
    exclude: null | ParsedContextFilterItem[]
}

interface ParsedContextFilterItem {
    repoNamePattern: RE2
    filePathPatterns?: RE2[]
}

// Note: This can not be an empty string to make all non `false` values truthy.
export type IsIgnored =
    | false
    | Error
    | 'has-ignore-everything-filters'
    | 'non-file-uri'
    | 'no-repo-found'
    | `repo:${string}`

export type GetRepoNamesContainingUri = (
    uri: vscode.Uri,
    signal?: AbortSignal
) => Promise<string[] | null>
type RepoName = string
type IsRepoNameIgnored = boolean

// These schemes are always deemed safe. Remote context has https URIs, but
// the remote applies Cody Context Filters rules.
const allowedSchemes = new Set(['http', 'https'])

// hasAllowEverythingFilters, hasIgnoreEverythingFilters relies on === equality
// for fast paths.
function canonicalizeContextFilters(filters: ContextFilters | Error): ContextFilters | Error {
    if (isEqual(filters, INCLUDE_EVERYTHING_CONTEXT_FILTERS)) {
        return INCLUDE_EVERYTHING_CONTEXT_FILTERS
    }
    if (isEqual(filters, EXCLUDE_EVERYTHING_CONTEXT_FILTERS)) {
        return EXCLUDE_EVERYTHING_CONTEXT_FILTERS
    }
    return filters
}

export class ContextFiltersProvider implements vscode.Disposable {
    static repoNameResolver: {
        getRepoNamesContainingUri: GetRepoNamesContainingUri
    }

    /**
     * `null` value means that we failed to fetch context filters.
     * In that case, we should exclude all the URIs.
     */
    private lastContextFiltersResponse: ContextFilters | Error | null = null
    private parsedContextFilters: ParsedContextFilters | null = null

    private cache = new LRUCache<RepoName, IsRepoNameIgnored>({ max: 128 })

    private lastFetchDelay = 0
    private lastFetchTimestamp = 0
    private lastResultLifetime: Promise<RefetchIntervalHint> = Promise.resolve(
        TRANSIENT_REFETCH_INTERVAL_HINT
    )

    // Visible for testing.
    public get timerStateForTest() {
        return { delay: this.lastFetchDelay, lifetime: this.lastResultLifetime }
    }

    private readonly contextFiltersSubscriber = createSubscriber<ContextFilters | Error>()
    public readonly onContextFiltersChanged = this.contextFiltersSubscriber.subscribe

    // Fetches context filters and updates the cached filter results
    private async fetchContextFilters(): Promise<RefetchIntervalHint> {
        try {
            const { filters, refetchIntervalHint } = await graphqlClient.contextFilters()
            this.setContextFilters(filters)
            return refetchIntervalHint
        } catch (error) {
            logError('ContextFiltersProvider', 'fetchContextFilters', {
                verbose: error,
            })
            return TRANSIENT_REFETCH_INTERVAL_HINT
        }
    }

    public get changes(): Observable<ContextFilters | Error | null> {
        return fromVSCodeEvent(
            listener => {
                const dispose = this.onContextFiltersChanged(listener)
                return { dispose }
            },
            () => this.lastContextFiltersResponse
        )
    }

    private setContextFilters(contextFilters: ContextFilters | Error): void {
        if (isEqual(contextFilters, this.lastContextFiltersResponse)) {
            return
        }

        this.cache.clear()
        this.parsedContextFilters = null
        this.lastContextFiltersResponse = canonicalizeContextFilters(contextFilters)

        // Disable logging for unit tests. Retain for manual debugging of enterprise issues.
        if (!cenv.CODY_TESTING_LOG_SUPRESS_VERBOSE) {
            logDebug('ContextFiltersProvider', 'setContextFilters', {
                verbose: contextFilters,
            })
        }

        this.parsedContextFilters = this.parseContextFilter(
            isError(contextFilters) ? EXCLUDE_EVERYTHING_CONTEXT_FILTERS : contextFilters
        )

        this.contextFiltersSubscriber.notify(this.lastContextFiltersResponse)
    }

    private parseContextFilter(contextFilters: ContextFilters): ParsedContextFilters {
        return {
            include: contextFilters.include?.map(parseContextFilterItem) || null,
            exclude: contextFilters.exclude?.map(parseContextFilterItem) || null,
        }
    }

    /**
     * Overrides context filters for testing.
     */
    public setTestingContextFilters(contextFilters: ContextFilters | null): void {
        if (contextFilters === null) {
            this.reset() // reset context filters to the value from the Sourcegraph API
        } else {
            this.setContextFilters(contextFilters)
        }
    }

    private async fetchIfNeeded(): Promise<void> {
        this.lastResultLifetime = this.lastResultLifetime.then(async intervalHint => {
            if (this.lastFetchTimestamp + this.lastFetchDelay < Date.now()) {
                this.lastFetchTimestamp = Date.now()
                const nextIntervalHint = await this.fetchContextFilters()

                if (isEqual(intervalHint, nextIntervalHint)) {
                    this.lastFetchDelay *= nextIntervalHint.backoff
                } else {
                    this.lastFetchDelay = nextIntervalHint.initialInterval
                }

                return nextIntervalHint
            }
            return intervalHint
        })

        await this.lastResultLifetime
    }

    public async isRepoNameIgnored(repoName: string): Promise<boolean> {
        if (isDotCom(currentAuthStatus())) {
            return false
        }

        await this.fetchIfNeeded()
        return this.isRepoNameIgnored__noFetch(repoName)
    }

    private isRepoNameIgnored__noFetch(repoName: string): boolean {
        const cached = this.cache.get(repoName)
        if (cached !== undefined) {
            return cached
        }

        // If we don't have any context filters, we exclude everything.
        let isIgnored = this.parsedContextFilters === null

        for (const parsedFilter of this.parsedContextFilters?.include || []) {
            isIgnored = !matchesContextFilter(parsedFilter, repoName)
            if (!isIgnored) {
                break
            }
        }

        for (const parsedFilter of this.parsedContextFilters?.exclude || []) {
            if (matchesContextFilter(parsedFilter, repoName)) {
                isIgnored = true
                break
            }
        }

        this.cache.set(repoName, isIgnored)
        return isIgnored
    }

    public async isUriIgnored(uri: vscode.Uri): Promise<IsIgnored> {
        if (isDotCom(currentAuthStatus())) {
            return false
        }
        await this.fetchIfNeeded()

        if (allowedSchemes.has(uri.scheme) || this.hasAllowEverythingFilters()) {
            return false
        }
        if (this.hasIgnoreEverythingFilters()) {
            return 'has-ignore-everything-filters'
        }

        const maybeError = this.lastContextFiltersResponse
        if (isError(maybeError)) {
            return maybeError
        }

        // TODO: process non-file URIs https://github.com/sourcegraph/cody/issues/3893
        if (!isFileURI(uri)) {
            logDebug('ContextFiltersProvider', 'isUriIgnored', `non-file URI ${uri.scheme}`)
            return 'non-file-uri'
        }

        if (!ContextFiltersProvider.repoNameResolver) {
            throw new Error('ContextFiltersProvider.repoNameResolver must be set statically')
        }
        const repoNames = await wrapInActiveSpan(
            'repoNameResolver.getRepoNamesFromWorkspaceUri',
            span => {
                span.setAttribute('sampled', true)
                return ContextFiltersProvider.repoNameResolver.getRepoNamesContainingUri?.(uri)
            }
        )

        if (!repoNames?.length) {
            return 'no-repo-found'
        }

        const ignoredRepo = repoNames.find(repoName => this.isRepoNameIgnored__noFetch(repoName))
        if (ignoredRepo) {
            return `repo:${ignoredRepo}`
        }

        return false
    }

    private reset(): void {
        this.lastFetchTimestamp = 0
        this.lastResultLifetime = Promise.resolve(TRANSIENT_REFETCH_INTERVAL_HINT)
        this.lastFetchDelay = 0
        this.lastContextFiltersResponse = null
        this.parsedContextFilters = null

        this.cache.clear()
    }

    public dispose(): void {
        this.reset()
    }

    private hasAllowEverythingFilters(): boolean {
        return (
            isDotCom(currentAuthStatus()) ||
            this.lastContextFiltersResponse === INCLUDE_EVERYTHING_CONTEXT_FILTERS
        )
    }

    private hasIgnoreEverythingFilters() {
        return this.lastContextFiltersResponse === EXCLUDE_EVERYTHING_CONTEXT_FILTERS
    }

    public toDebugObject() {
        return {
            lastContextFiltersResponse: JSON.parse(JSON.stringify(this.lastContextFiltersResponse)),
        }
    }
}

function matchesContextFilter(parsedFilter: ParsedContextFilterItem, repoName: string): boolean {
    // Calling `RE2.matches(input)` only looks for full matches, so we use
    // `RE2.matcher(input).find(0)` to find matches anywhere in `input` (which is the standard way
    // regexps work).
    return Boolean(parsedFilter.repoNamePattern.matcher(repoName).find(0))
}

function parseContextFilterItem(item: CodyContextFilterItem): ParsedContextFilterItem {
    const repoNamePattern = RE2.compile(item.repoNamePattern)
    const filePathPatterns = item.filePathPatterns
        ? item.filePathPatterns.map(pattern => RE2.compile(pattern))
        : undefined

    return { repoNamePattern, filePathPatterns }
}

/**
 * A singleton instance of the `ContextFiltersProvider` class.
 */
export const contextFiltersProvider = new ContextFiltersProvider()
