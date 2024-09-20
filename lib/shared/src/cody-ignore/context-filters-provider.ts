import { isEqual } from 'lodash'
import { LRUCache } from 'lru-cache'
import type { Observable } from 'observable-fns'
import { RE2JS as RE2 } from 're2js'
import type * as vscode from 'vscode'
import { currentAuthStatus } from '../auth/authStatus'
import { isFileURI } from '../common/uri'
import { logDebug, logError } from '../logger'
import { fromVSCodeEvent } from '../misc/observable'
import { isDotCom } from '../sourcegraph-api/environments'
import { graphqlClient } from '../sourcegraph-api/graphql'
import {
    type CodyContextFilterItem,
    type ContextFilters,
    EXCLUDE_EVERYTHING_CONTEXT_FILTERS,
    INCLUDE_EVERYTHING_CONTEXT_FILTERS,
} from '../sourcegraph-api/graphql/client'
import { wrapInActiveSpan } from '../tracing'
import { createSubscriber } from '../utils'

// The policy for how often to re-fetch results. Changing configurations
// triggers an immediate refetch. After that, successfully retrieving results
// ("durable" results) we'll refetch after a long interval; encountering
// network errors, etc. ("ephemeral" results) we'll refetch after a short
// interval.
//
// Failures use an exponential backoff.
export const REFETCH_INTERVAL_MAP = {
    durable: {
        initialInterval: 60 * 60 * 1000, // 1 hour
        backoff: 1.0,
    },
    ephemeral: {
        initialInterval: 7 * 1000, // 7 seconds
        backoff: 1.5,
    },
}

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
    | 'has-ignore-everything-filters'
    | 'non-file-uri'
    | 'no-repo-found'
    | `repo:${string}`

export type GetRepoNamesFromWorkspaceUri = (
    uri: vscode.Uri,
    signal?: AbortSignal
) => Promise<string[] | null>
type RepoName = string
type IsRepoNameIgnored = boolean

// These schemes are always deemed safe. Remote context has https URIs, but
// the remote applies Cody Context Filters rules.
const allowedSchemes = new Set(['http', 'https'])

type ResultLifetime = 'ephemeral' | 'durable'

// hasAllowEverythingFilters, hasIgnoreEverythingFilters relies on === equality
// for fast paths.
function canonicalizeContextFilters(filters: ContextFilters): ContextFilters {
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
        getRepoNamesFromWorkspaceUri: GetRepoNamesFromWorkspaceUri
    }

    /**
     * `null` value means that we failed to fetch context filters.
     * In that case, we should exclude all the URIs.
     */
    private lastContextFiltersResponse: ContextFilters | null = null
    private parsedContextFilters: ParsedContextFilters | null = null

    private cache = new LRUCache<RepoName, IsRepoNameIgnored>({ max: 128 })

    private lastFetchDelay = 0
    private lastResultLifetime: ResultLifetime | undefined = undefined
    private fetchIntervalId: NodeJS.Timeout | undefined | number

    // Visible for testing.
    public get timerStateForTest() {
        return { delay: this.lastFetchDelay, lifetime: this.lastResultLifetime }
    }

    private readonly contextFiltersSubscriber = createSubscriber<ContextFilters>()
    public readonly onContextFiltersChanged = this.contextFiltersSubscriber.subscribe

    // Fetches context filters and updates the cached filter results. Returns
    // 'ephemeral' if the results should be re-queried sooner because they
    // are transient results arising from, say, a network error; or 'durable'
    // if the results can be cached for a while.
    private async fetchContextFilters(): Promise<ResultLifetime> {
        try {
            const { filters, transient } = await graphqlClient.contextFilters()
            this.setContextFilters(filters)
            return transient ? 'ephemeral' : 'durable'
        } catch (error) {
            logError('ContextFiltersProvider', 'fetchContextFilters', {
                verbose: error,
            })
            return 'ephemeral'
        }
    }

    public get changes(): Observable<ContextFilters> {
        return fromVSCodeEvent(listener => {
            const dispose = this.onContextFiltersChanged(listener)
            return { dispose }
        })
    }

    private setContextFilters(contextFilters: ContextFilters): void {
        if (isEqual(contextFilters, this.lastContextFiltersResponse)) {
            return
        }

        this.cache.clear()
        this.parsedContextFilters = null
        this.lastContextFiltersResponse = canonicalizeContextFilters(contextFilters)

        // Disable logging for unit tests. Retain for manual debugging of enterprise issues.
        if (!process.env.VITEST) {
            logDebug('ContextFiltersProvider', 'setContextFilters', {
                verbose: contextFilters,
            })
        }
        this.parsedContextFilters = {
            include: contextFilters.include?.map(parseContextFilterItem) || null,
            exclude: contextFilters.exclude?.map(parseContextFilterItem) || null,
        }

        this.contextFiltersSubscriber.notify(contextFilters)
    }

    private isTesting = false

    /**
     * Overrides context filters for testing.
     */
    public setTestingContextFilters(contextFilters: ContextFilters | null): void {
        if (contextFilters === null) {
            this.isTesting = false
            this.reset() // reset context filters to the value from the Sourcegraph API
        } else {
            this.isTesting = true
            this.setContextFilters(contextFilters)
        }
    }

    private startRefetchTimer(intervalHint: ResultLifetime): void {
        if (this.lastResultLifetime === intervalHint) {
            this.lastFetchDelay *= REFETCH_INTERVAL_MAP[intervalHint].backoff
        } else {
            this.lastFetchDelay = REFETCH_INTERVAL_MAP[intervalHint].initialInterval
            this.lastResultLifetime = intervalHint
        }
        this.fetchIntervalId = setTimeout(async () => {
            this.startRefetchTimer(await this.fetchContextFilters())
        }, this.lastFetchDelay)
    }

    private async fetchIfNeeded(): Promise<void> {
        if (!this.fetchIntervalId && !this.isTesting) {
            const intervalHint = await this.fetchContextFilters()
            this.startRefetchTimer(intervalHint)
        }
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
                return ContextFiltersProvider.repoNameResolver.getRepoNamesFromWorkspaceUri?.(uri)
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
        this.lastFetchDelay = 0
        this.lastResultLifetime = undefined
        this.lastContextFiltersResponse = null
        this.parsedContextFilters = null

        this.cache.clear()

        if (this.fetchIntervalId) {
            clearTimeout(this.fetchIntervalId)
            this.fetchIntervalId = undefined
        }
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
