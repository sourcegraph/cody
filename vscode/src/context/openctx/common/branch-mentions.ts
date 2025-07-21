import type { Mention } from '@openctx/client'
import { currentResolvedConfig, isDefined } from '@sourcegraph/cody-shared'
import { getRepositoryMentions } from './get-repository-mentions'

export interface BranchMentionOptions {
    repoName: string
    providerUri: string
    branchQuery?: string
}

/**
 * Creates branch mentions for a repository, including branch search functionality.
 */
export async function getBranchMentions(options: BranchMentionOptions): Promise<Mention[]> {
    const { repoName, providerUri, branchQuery } = options

    // Get branch info from the repository mentions
    const repoMentions = await getRepositoryMentions(repoName, providerUri)
    if (!repoMentions || repoMentions.length === 0) {
        return []
    }

    const repoMention = repoMentions.find(mention => mention.data?.repoName === repoName)

    if (!repoMention?.data) {
        return []
    }

    const branches = (repoMention.data.branches as string[]) || []
    const defaultBranch = repoMention.data.defaultBranch as string | undefined
    const repoId = repoMention.data.repoId as string

    // If no branch info available, return empty
    if (branches.length === 0 && !defaultBranch) {
        return []
    }

    // Filter branches if we have a search query
    let filteredBranches = branches
    if (branchQuery && branchQuery.trim()) {
        const query = branchQuery.toLowerCase()
        filteredBranches = branches.filter(branch => branch.toLowerCase().includes(query))
    }

    return createBranchMentionsFromData({
        repoName,
        repoId,
        defaultBranch,
        branches: filteredBranches,
        branchQuery,
    })
}

export interface CreateBranchMentionsOptions {
    repoName: string
    repoId: string
    defaultBranch?: string
    branches?: string[]
    branchQuery?: string
}

/**
 * Creates mention objects for branches with optional browse and search hint options.
 */
export async function createBranchMentionsFromData(
    options: CreateBranchMentionsOptions
): Promise<Mention[]> {
    const { repoName, repoId, defaultBranch, branches = [] } = options

    const {
        auth: { serverEndpoint },
    } = await currentResolvedConfig()

    const mentions: Mention[] = []

    // Add default branch first if available and it's in the branches list
    if (defaultBranch && branches.includes(defaultBranch)) {
        mentions.push({
            uri: `${serverEndpoint.replace(/\/$/, '')}/${repoName}@${defaultBranch}`,
            title: `@${defaultBranch}`,
            description: 'Default branch',
            data: {
                repoName,
                repoID: repoId,
                branch: defaultBranch,
            },
        })
    }

    // Add other branches
    for (const branch of branches) {
        if (branch !== defaultBranch) {
            mentions.push({
                uri: `${serverEndpoint.replace(/\/$/, '')}/${repoName}@${branch}`,
                title: `@${branch}`,
                description: ' ',
                data: {
                    repoName,
                    repoID: repoId,
                    branch,
                },
            })
        }
    }

    return mentions.filter(isDefined)
}

/**
 * Parses a query string to extract repository name, branch, and path components.
 * Supports formats like:
 * - "repo" -> { repoName: "repo" }
 * - "repo:" -> { repoName: "repo", showBranches: true }
 * - "repo:@" -> { repoName: "repo", branchSearch: true }
 * - "repo:@branch" -> { repoName: "repo", branch: "branch" }
 * - "repo:@branch:path" -> { repoName: "repo", branch: "branch", path: "path" }
 * - "repo:path" -> { repoName: "repo", path: "path" }
 */
export interface ParsedQuery {
    repoName: string
    showBranches?: boolean
    branchSearch?: boolean
    branch?: string
    path?: string
}

export function parseRemoteQuery(query: string): ParsedQuery | null {
    if (!query || !query.includes(':')) {
        return query ? { repoName: query.trim() } : null
    }

    const parts = query.split(':')
    const repoName = parts[0]?.trim()

    if (!repoName) {
        return null
    }

    // If just "repo:", show branches
    if (parts.length === 2 && !parts[1]?.trim()) {
        return { repoName, showBranches: true }
    }

    const secondPart = parts[1]?.trim() ?? ''

    // Handle branch selection: "repo:@" or "repo:@branch"
    if (secondPart.startsWith('@')) {
        const branchQuery = secondPart.substring(1) // Remove @

        // If just "repo:@", show branch search
        if (!branchQuery) {
            return { repoName, branchSearch: true }
        }

        // If "repo:@branch" with no path part, return branch
        if (parts.length === 2) {
            return { repoName, branch: branchQuery }
        }

        // If "repo:@branch:path", return branch and path
        const path = parts.slice(2).join(':').trim()
        return { repoName, branch: branchQuery, path }
    }

    // Default case: "repo:path"
    const path = parts.slice(1).join(':').trim()
    return { repoName, path }
}
