import { LRUCache } from 'lru-cache'
import RE2 from 're2'
import type * as vscode from 'vscode'

import { type CodyContextFilterItem, graphqlClient, logError } from '@sourcegraph/cody-shared'

const REFETCH_INTERVAL = 60 * 60 * 1000 // 1 hour

interface ParsedContextFilters {
    include: ParsedContextFilterItem[]
    exclude: ParsedContextFilterItem[]
}

interface ParsedContextFilterItem {
    repoNamePattern: RE2
    filePathPattern?: RE2
}

export class ContextFiltersProvider implements vscode.Disposable {
    private contextFilters: ParsedContextFilters | null = null
    private fetchIntervalId: NodeJS.Timer | undefined
    private cache = new LRUCache<string, boolean>({ max: 128 })

    async init() {
        await this.fetchContextFilters()
        this.startRefetchTimer()
        return this.contextFilters
    }

    private async fetchContextFilters(): Promise<void> {
        try {
            const response = await graphqlClient.contextFilters()
            if (response instanceof Error) {
                logError('ContextFiltersProvider', 'fetchContextFilters', response)
            } else {
                this.cache.clear()

                if (response) {
                    this.contextFilters = {
                        include: response.include.map(parseContextFilterItem),
                        exclude: response.exclude.map(parseContextFilterItem),
                    }
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

    public isPathAllowed(repoName: string, relativePath: string): boolean {
        const cacheKey = `${repoName}:${relativePath}`
        const cached = this.cache.get(cacheKey)
        if (cached !== undefined) {
            return cached
        }

        // If we don't have any context filters, we exclude everything.
        let isAllowed = Boolean(this.contextFilters)

        if (this.contextFilters?.include.length) {
            isAllowed = false
            for (const parsedFilter of this.contextFilters.include) {
                isAllowed = checkFilter(parsedFilter, repoName, relativePath)

                if (isAllowed) {
                    break
                }
            }
        }

        if (isAllowed && this.contextFilters?.exclude.length) {
            for (const parsedFilter of this.contextFilters.exclude) {
                const matchesFilter = checkFilter(parsedFilter, repoName, relativePath)

                if (matchesFilter) {
                    isAllowed = false
                    break
                }
            }
        }

        this.cache.set(cacheKey, isAllowed)
        return isAllowed
    }

    public dispose(): void {
        this.cache.clear()

        if (this.fetchIntervalId) {
            clearTimeout(this.fetchIntervalId)
        }
    }
}

function checkFilter(
    parsedFilter: ParsedContextFilterItem,
    repoName: string,
    relativePath: string
): boolean {
    const matchesRepo = Boolean(parsedFilter.repoNamePattern.match(repoName))

    if (!parsedFilter.filePathPattern) {
        return matchesRepo
    }

    const matchesPath = Boolean(parsedFilter.filePathPattern.match(relativePath))

    return matchesRepo && matchesPath
}

function parseContextFilterItem(item: CodyContextFilterItem): ParsedContextFilterItem {
    const repoNamePattern = new RE2(item.repoNamePattern)
    const filePathPattern = item.filePathPattern ? new RE2(item.filePathPattern) : undefined

    return { repoNamePattern, filePathPattern }
}
