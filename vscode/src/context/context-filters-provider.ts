import { LRUCache } from 'lru-cache'
import { RE2 } from 're2-wasm'
import * as vscode from 'vscode'

import {
    type CodyContextFilterItem,
    graphqlClient,
    isFileURI,
    logError,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import { getCodebaseFromWorkspaceUriAsync } from '../repository/repositoryHelpers'

export const REFETCH_INTERVAL = 60 * 60 * 1000 // 1 hour

interface ParsedContextFilters {
    include: ParsedContextFilterItem[]
    exclude: ParsedContextFilterItem[]
}

interface ParsedContextFilterItem {
    repoNamePattern: RE2
    filePathPatterns?: RE2[]
}

export class ContextFiltersProvider implements vscode.Disposable {
    private contextFilters: ParsedContextFilters | null = null
    private fetchIntervalId: NodeJS.Timer | undefined
    private cache = new LRUCache<string, boolean>({ max: 128 })

    async init() {
        await this.fetchContextFilters()
        this.startRefetchTimer()
    }

    private async fetchContextFilters(): Promise<void> {
        try {
            const response = await graphqlClient.contextFilters()
            if (response instanceof Error) {
                logError('ContextFiltersProvider', 'fetchContextFilters', response)
            } else {
                this.cache.clear()
                this.contextFilters = null

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

    public async isUriAllowed(uri: vscode.Uri): Promise<boolean> {
        if (!isFileURI(uri)) {
            return false
        }

        const repoName = await wrapInActiveSpan('getCodebaseFromWorkspaceUriAsync', () =>
            getCodebaseFromWorkspaceUriAsync(uri)
        )

        const relativePath = vscode.workspace.asRelativePath(uri, false)

        if (repoName) {
            return this.isPathAllowed(repoName, relativePath)
        }

        return false
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

    if (!parsedFilter.filePathPatterns) {
        return matchesRepo
    }

    const matchesPath = parsedFilter.filePathPatterns.some(pattern =>
        Boolean(pattern.match(relativePath))
    )

    return matchesRepo && matchesPath
}

function parseContextFilterItem(item: CodyContextFilterItem): ParsedContextFilterItem {
    const repoNamePattern = new RE2(item.repoNamePattern, 'u')
    const filePathPatterns = item.filePathPatterns
        ? item.filePathPatterns.map(pattern => new RE2(pattern, 'u'))
        : undefined

    return { repoNamePattern, filePathPatterns }
}
