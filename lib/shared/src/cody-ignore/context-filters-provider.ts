import { LRUCache } from 'lru-cache'
import { RE2 } from 're2-wasm'
import type * as vscode from 'vscode'
import { isFileURI } from '../common/uri'
import { logDebug, logError } from '../logger'
import { graphqlClient } from '../sourcegraph-api/graphql'
import type { CodyContextFilterItem } from '../sourcegraph-api/graphql/client'
import { wrapInActiveSpan } from '../tracing'

export const REFETCH_INTERVAL = 60 * 60 * 1000 // 1 hour

interface ParsedContextFilters {
    include: ParsedContextFilterItem[]
    exclude: ParsedContextFilterItem[]
}

interface ParsedContextFilterItem {
    repoNamePattern: RE2
    filePathPatterns?: RE2[]
}

export type GetRepoNameFromWorkspaceUri = (uri: vscode.Uri) => Promise<string | undefined>

export class ContextFiltersProvider implements vscode.Disposable {
    private contextFilters: ParsedContextFilters | null = null
    private fetchIntervalId: NodeJS.Timer | undefined
    private cache = new LRUCache<string, boolean>({ max: 128 })
    private getRepoNameFromWorkspaceUri: GetRepoNameFromWorkspaceUri | undefined = undefined

    async init(getRepoNameFromWorkspaceUri: GetRepoNameFromWorkspaceUri) {
        this.getRepoNameFromWorkspaceUri = getRepoNameFromWorkspaceUri
        this.dispose()
        await this.fetchContextFilters()
        this.startRefetchTimer()
    }

    private async fetchContextFilters(): Promise<void> {
        try {
            const response = await graphqlClient.contextFilters()
            this.cache.clear()
            this.contextFilters = null

            if (response) {
                logDebug('ContextFiltersProvider', 'fetchContextFilters', { verbose: response })
                this.contextFilters = {
                    include: (response.include || []).map(parseContextFilterItem),
                    exclude: (response.exclude || []).map(parseContextFilterItem),
                }
            }
        } catch (error) {
            if (error instanceof Error) {
                logError('ContextFiltersProvider', 'fetchContextFilters', error)
                return
            }
        }
    }

    private startRefetchTimer(): void {
        this.fetchIntervalId = setTimeout(() => {
            this.fetchContextFilters()
            this.startRefetchTimer()
        }, REFETCH_INTERVAL)
    }

    public isRepoNameAllowed(repoName: string): boolean {
        const cached = this.cache.get(repoName)
        if (cached !== undefined) {
            return cached
        }

        // If we don't have any context filters, we exclude everything.
        let isAllowed = Boolean(this.contextFilters)

        if (this.contextFilters?.include.length) {
            for (const parsedFilter of this.contextFilters.include) {
                isAllowed = checkContextFilter(parsedFilter, repoName)

                if (isAllowed) {
                    break
                }
            }
        }

        if (isAllowed && this.contextFilters?.exclude.length) {
            for (const parsedFilter of this.contextFilters.exclude) {
                const matchesFilter = checkContextFilter(parsedFilter, repoName)

                if (matchesFilter) {
                    isAllowed = false
                    break
                }
            }
        }

        this.cache.set(repoName, isAllowed)
        return isAllowed
    }

    public async isUriAllowed(uri: vscode.Uri): Promise<boolean> {
        if (this.hasIncludeEverythingFilters()) {
            return true
        }

        if (this.hasExcludeEverythingFilters()) {
            return false
        }

        if (!isFileURI(uri)) {
            return false
        }

        const repoName = await wrapInActiveSpan('repoNameResolver.getRepoNameFromWorkspaceUri', () =>
            this.getRepoNameFromWorkspaceUri?.(uri)
        )

        return repoName ? this.isRepoNameAllowed(repoName) : false
    }

    public dispose(): void {
        this.cache.clear()

        if (this.fetchIntervalId) {
            clearTimeout(this.fetchIntervalId)
        }
    }

    private hasIncludeEverythingFilters() {
        return this.contextFilters?.include.length === 0 && this.contextFilters?.exclude.length === 0
    }

    private hasExcludeEverythingFilters() {
        return (
            this.contextFilters?.include.length === 0 &&
            this.contextFilters?.exclude.length === 1 &&
            this.contextFilters.exclude[0].repoNamePattern.toString() === '.*'
        )
    }
}

function checkContextFilter(parsedFilter: ParsedContextFilterItem, repoName: string): boolean {
    return Boolean(parsedFilter.repoNamePattern.match(repoName))
}

function parseContextFilterItem(item: CodyContextFilterItem): ParsedContextFilterItem {
    const repoNamePattern = new RE2(item.repoNamePattern, 'u')
    const filePathPatterns = item.filePathPatterns
        ? item.filePathPatterns.map(pattern => new RE2(pattern, 'u'))
        : undefined

    return { repoNamePattern, filePathPatterns }
}

/**
 * A singleton instance of the `ContextFiltersProvider` class.
 * `contextFiltersProvider.init` should be called and awaited on extension activation.
 */
export const contextFiltersProvider = new ContextFiltersProvider()
