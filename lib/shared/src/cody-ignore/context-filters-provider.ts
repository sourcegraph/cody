import { isEqual } from 'lodash'
import { LRUCache } from 'lru-cache'
import { RE2JS as RE2 } from 're2js'
import type * as vscode from 'vscode'
import { isFileURI } from '../common/uri'
import { logDebug, logError } from '../logger'
import { graphqlClient } from '../sourcegraph-api/graphql'
import {
    type CodyContextFilterItem,
    type ContextFilters,
    EXCLUDE_EVERYTHING_CONTEXT_FILTERS,
    INCLUDE_EVERYTHING_CONTEXT_FILTERS,
} from '../sourcegraph-api/graphql/client'
import { wrapInActiveSpan } from '../tracing'
import { createSubscriber } from '../utils'

export const REFETCH_INTERVAL = 60 * 60 * 1000 // 1 hour

interface ParsedContextFilters {
    include: null | ParsedContextFilterItem[]
    exclude: null | ParsedContextFilterItem[]
}

interface ParsedContextFilterItem {
    repoNamePattern: RE2
    filePathPatterns?: RE2[]
}

type IsIgnored =
    | false
    | 'has-ignore-everything-filters'
    | 'non-file-uri'
    | 'no-repo-found'
    | `repo:${string}`

export type GetRepoNamesFromWorkspaceUri = (uri: vscode.Uri) => Promise<string[] | null>
type RepoName = string
type IsRepoNameIgnored = boolean

// These schemes are always deemed safe. Remote context has https URIs, but
// the remote applies Cody ignore rules.
const allowedSchemes = new Set(['http', 'https'])

export class ContextFiltersProvider implements vscode.Disposable {
    /**
     * `null` value means that we failed to fetch context filters.
     * In that case, we should exclude all the URIs.
     */
    private lastContextFiltersResponse: ContextFilters | null = null
    private parsedContextFilters: ParsedContextFilters | null = null

    private cache = new LRUCache<RepoName, IsRepoNameIgnored>({ max: 128 })
    private getRepoNamesFromWorkspaceUri: GetRepoNamesFromWorkspaceUri | undefined = undefined

    private fetchIntervalId: NodeJS.Timeout | undefined | number

    private readonly contextFiltersSubscriber = createSubscriber<ContextFilters>()
    public readonly onContextFiltersChanged = this.contextFiltersSubscriber.subscribe

    async init(getRepoNamesFromWorkspaceUri: GetRepoNamesFromWorkspaceUri) {
        this.getRepoNamesFromWorkspaceUri = getRepoNamesFromWorkspaceUri
        this.dispose()
        await this.fetchContextFilters()
        this.startRefetchTimer()
    }

    private async fetchContextFilters(): Promise<void> {
        try {
            const response = await graphqlClient.contextFilters()
            this.setContextFilters(response)
        } catch (error) {
            logError('ContextFiltersProvider', 'fetchContextFilters', { verbose: error })
        }
    }

    private setContextFilters(contextFilters: ContextFilters): void {
        if (isEqual(contextFilters, this.lastContextFiltersResponse)) {
            return
        }

        this.cache.clear()
        this.parsedContextFilters = null
        this.lastContextFiltersResponse = contextFilters
        this.contextFiltersSubscriber.notify(contextFilters)

        logDebug('ContextFiltersProvider', 'setContextFilters', { verbose: contextFilters })
        this.parsedContextFilters = {
            include: contextFilters.include?.map(parseContextFilterItem) || null,
            exclude: contextFilters.exclude?.map(parseContextFilterItem) || null,
        }
    }

    /**
     * Overrides context filters for testing.
     */
    public setTestingContextFilters(contextFilters: ContextFilters | null): void {
        if (process.env.VITEST !== 'true') {
            throw new Error(
                'contextFiltersProvider.setTestingContextFilters should be only used in tests'
            )
        }

        if (contextFilters === null) {
            // Reset context filters to the value from the Sourcegraph API.
            this.init(this.getRepoNamesFromWorkspaceUri!)
        } else {
            this.setContextFilters(contextFilters)
        }
    }

    private startRefetchTimer(): void {
        this.fetchIntervalId = setTimeout(() => {
            this.fetchContextFilters()
            this.startRefetchTimer()
        }, REFETCH_INTERVAL)
    }

    public isRepoNameIgnored(repoName: string): boolean {
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

        const repoNames = await wrapInActiveSpan('repoNameResolver.getRepoNamesFromWorkspaceUri', () =>
            this.getRepoNamesFromWorkspaceUri?.(uri)
        )

        if (!repoNames) {
            return 'no-repo-found'
        }

        const ignoredRepo = repoNames.find(repoName => this.isRepoNameIgnored(repoName))
        if (ignoredRepo) {
            return `repo:${ignoredRepo}`
        }

        return false
    }

    public dispose(): void {
        this.cache.clear()

        if (this.fetchIntervalId) {
            clearTimeout(this.fetchIntervalId)
        }
    }

    private hasAllowEverythingFilters() {
        return this.lastContextFiltersResponse === INCLUDE_EVERYTHING_CONTEXT_FILTERS
    }

    private hasIgnoreEverythingFilters() {
        return this.lastContextFiltersResponse === EXCLUDE_EVERYTHING_CONTEXT_FILTERS
    }

    public toDebugObject() {
        return {
            lastContextFiltersResponse: this.lastContextFiltersResponse,
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
 * `contextFiltersProvider.init` should be called and awaited on extension activation.
 */
export const contextFiltersProvider = new ContextFiltersProvider()
