import { REMOTE_DIRECTORY_PROVIDER_URI, currentResolvedConfig } from '@sourcegraph/cody-shared'

import type { Item, Mention } from '@openctx/client'
import { graphqlClient, isDefined, isError } from '@sourcegraph/cody-shared'
import { getRepositoryMentions } from './common/get-repository-mentions'
import { getBranchMentions } from './common/branch-mentions'
import { escapeRegExp } from './remoteFileSearch'

import type { OpenCtxProvider } from './types'

/**
 * Extracts repo name and optional branch from a string.
 * Supports formats: "repo@branch", "repo", or "repo:directory@branch"
 */
function extractRepoAndBranch(input: string): [string, string | undefined] {
    // Handle case where input contains a colon (repo:directory@branch)
    const colonIndex = input.indexOf(':')
    if (colonIndex !== -1) {
        const repoPart = input.substring(0, colonIndex)
        const atIndex = repoPart.indexOf('@')
        if (atIndex !== -1) {
            return [repoPart.substring(0, atIndex), repoPart.substring(atIndex + 1)]
        }
        return [repoPart, undefined]
    }

    // Handle simple case: repo@branch or repo
    const atIndex = input.indexOf('@')
    if (atIndex !== -1) {
        return [input.substring(0, atIndex), input.substring(atIndex + 1)]
    }

    return [input, undefined]
}

const RemoteDirectoryProvider = createRemoteDirectoryProvider()

export function createRemoteDirectoryProvider(customTitle?: string): OpenCtxProvider {
    return {
        providerUri: REMOTE_DIRECTORY_PROVIDER_URI,

        meta() {
            return {
                name: customTitle ?? 'Remote Directories',
                mentions: {},
            }
        },

        async mentions({ query }) {
            const [repoName, directoryPath] = query?.split(':') || []

            if (!query?.includes(':') || !repoName.trim()) {
                // Check if the query contains branch specification (@branch) but NOT colon
                // This handles formats like "repo@branch" but not "repo:@branch"
                if (query?.includes('@') && !query.includes(':')) {
                    // Handle both @branch and @branch/directory formats
                    // TODO: This logic currently treats any '/' after '@' as a directory separator,
                    // but branch names can contain '/' (e.g., 'feature/fix-123').
                    // We need better heuristics to distinguish between branch names with slashes
                    // and actual directory paths.
                    const trimmedQuery = query?.trim() ?? ''
                    const atIndex = trimmedQuery.indexOf('@')
                    const slashIndex = atIndex >= 0 ? trimmedQuery.indexOf('/', atIndex) : -1

                    if (slashIndex > 0) {
                        // Format: repo@branch/directory
                        const repoWithBranch = trimmedQuery.substring(0, slashIndex)
                        const directoryPathPart = trimmedQuery.substring(slashIndex + 1)
                        return await getDirectoryMentions(repoWithBranch, directoryPathPart)
                    }

                    // Format: repo@branch (root directory search)
                    const [repoNamePart] = extractRepoAndBranch(trimmedQuery)
                    if (repoNamePart.trim()) {
                        return await getDirectoryMentions(trimmedQuery, '')
                    }
                }
                return await getRepositoryMentions(query?.trim() ?? '', REMOTE_DIRECTORY_PROVIDER_URI)
            }

            // Handle case where user types repo:@branch (colon followed by @branch)
            if (directoryPath?.startsWith('@')) {
                let branchQuery = directoryPath.substring(1) // Remove the @

                // Handle trailing colon from mention menu (repo:@branch: -> @branch:)
                if (branchQuery.endsWith(':')) {
                    branchQuery = branchQuery.slice(0, -1) // Remove trailing colon
                    // This is a branch selection from mention menu, show directory listing
                    return await getDirectoryMentions(`${repoName}@${branchQuery}`, '')
                }

                // Check if this looks like a complete branch name (no spaces, reasonable length)
                // vs a search query (partial, contains spaces, etc.)
                const slashIndex = directoryPath.indexOf('/')
                if (slashIndex > 0) {
                    // Format: repo:@branch/directory - treat as exact branch
                    const branchPart = directoryPath.substring(0, slashIndex)
                    const directoryPathPart = directoryPath.substring(slashIndex + 1)
                    return await getDirectoryMentions(`${repoName}${branchPart}`, directoryPathPart)
                }

                // Use fuzzy search for empty queries (just @) or short queries that look like partial searches
                // Longer queries or queries with common branch patterns are treated as exact branch names
                const looksLikeSearch = branchQuery.length === 0 ||
                                      (branchQuery.length > 0 && branchQuery.length <= 6 &&
                                      !branchQuery.includes('-') && !branchQuery.includes('/') &&
                                      !branchQuery.includes('_'))
                if (looksLikeSearch) {
                    return await getDirectoryBranchMentions(repoName, branchQuery)
                }

                // Otherwise treat as exact branch name
                const repoWithBranch = `${repoName}@${branchQuery}`
                return await getDirectoryMentions(repoWithBranch, '')
            }

            // Check if we should show branch suggestions for this repository
            if (!directoryPath.trim()) {
                // Check if repoName contains a branch (repo@branch format from mention menu)
                if (repoName.includes('@')) {
                    // This is "repo@branch:" - show directory listing for this branch
                    return await getDirectoryMentions(repoName, '')
                }
                // User typed "repo:" - show branch suggestions
                return await getDirectoryBranchMentions(repoName)
            }

            // Check if user is searching for branches (starts with @)
            if (directoryPath.startsWith('@')) {
                // User typed "repo:@query" - search for branches matching query
                const branchQuery = directoryPath.substring(1) // Remove the @
                return await getDirectoryBranchMentions(repoName, branchQuery)
            }

            return await getDirectoryMentions(repoName, directoryPath.trim())
        },

        async items({ mention, message }) {
            if (!mention?.data?.repoID || !mention?.data?.directoryPath || !message) {
                return []
            }

            const revision = mention.data.branch ?? mention.data.rev
            return await getDirectoryItem(
                message,
                mention.data.repoID as string,
                mention.data.repoName as string,
                mention.data.directoryPath as string,
                revision as string
            )
        },
    }
}

async function getDirectoryMentions(repoName: string, directoryPath?: string): Promise<Mention[]> {
    // Parse repo name and optional branch (format: repo@branch or repo:directory@branch)
    const [repoNamePart, branchPart] = extractRepoAndBranch(repoName)
    const repoRe = `^${escapeRegExp(repoNamePart)}$`
    const directoryRe = directoryPath ? escapeRegExp(directoryPath) : ''
    const repoWithBranch = branchPart ? `${repoRe}@${escapeRegExp(branchPart)}` : repoRe

    // For root directory search, use a pattern that finds top-level directories
    const filePattern = directoryPath ? `^${directoryRe}.*\\/.*` : '[^/]+\\/.*'
    const query = `repo:${repoWithBranch} file:${filePattern} select:file.directory count:10`

    const {
        auth: { serverEndpoint },
    } = await currentResolvedConfig()
    const dataOrError = await graphqlClient.searchFileMatches(query)

    if (isError(dataOrError) || dataOrError === null) {
        return []
    }

    return dataOrError.search.results.results
        .map(result => {
            if (result.__typename !== 'FileMatch') {
                return null
            }

            // Construct URL with branch information if available
            const baseUrl = `${serverEndpoint.replace(/\/$/, '')}/${result.repository.name}`
            const branchUrl = branchPart ? `${baseUrl}@${branchPart}` : baseUrl
            const url = `${branchUrl}/-/tree/${result.file.path}`

            return {
                uri: url,
                title: result.file.path,
                description: ' ',
                data: {
                    repoName: result.repository.name,
                    repoID: result.repository.id,
                    rev: result.file.commit.oid,
                    directoryPath: result.file.path,
                    branch: branchPart,
                },
            } satisfies Mention
        })
        .filter(isDefined)
}

async function getDirectoryBranchMentions(repoName: string, branchQuery?: string): Promise<Mention[]> {
    const branchMentions = await getBranchMentions({
        repoName,
        providerUri: REMOTE_DIRECTORY_PROVIDER_URI,
        branchQuery,
    })

    // If no branch mentions found, fallback to directory search
    if (branchMentions.length === 0) {
        return await getDirectoryMentions(repoName, '')
    }

    return branchMentions
}


async function getDirectoryItem(
    _userMessage: string, // ignore content - we want all files in directory
    repoID: string,
    repoName: string,
    directoryPath: string,
    revision?: string
): Promise<Item[]> {
    const filePatterns = [`^${escapeRegExp(directoryPath)}.*`]
    // Use directory basename as search query since contextSearch requires non-empty query
    const searchQuery = directoryPath.split('/').pop() || '.'
    const dataOrError = await graphqlClient.contextSearch({
        repoIDs: [repoID],
        query: searchQuery,
        filePatterns,
        revision,
    })

    if (isError(dataOrError) || dataOrError === null) {
        return []
    }

    // If contextSearch returns no results, try fallback to getDirectoryContents
    if (dataOrError.length === 0) {
        const fallbackData = await graphqlClient.getDirectoryContents(repoName, directoryPath, revision)
        if (!isError(fallbackData) && fallbackData !== null) {
            const entries = fallbackData.repository?.commit?.tree?.entries || []
            const {
                auth: { serverEndpoint },
            } = await currentResolvedConfig()

            return entries
                .filter(entry => entry.content && !entry.isDirectory) // Only include files with content
                .map(entry => ({
                    url: revision
                        ? `${serverEndpoint.replace(/\/$/, '')}/${repoName}@${revision}/-/blob/${
                              entry.path
                          }`
                        : `${serverEndpoint.replace(/\/$/, '')}${entry.url}`,
                    title: entry.path,
                    ai: {
                        content: entry.content,
                    },
                })) as Item[]
        }
        return []
    }

    const {
        auth: { serverEndpoint },
    } = await currentResolvedConfig()

    return dataOrError.map(
        node =>
            ({
                url: revision
                    ? `${serverEndpoint.replace(/\/$/, '')}/${node.repoName}@${revision}/-/blob/${
                          node.path
                      }`
                    : node.uri.toString(),
                title: node.path,
                ai: {
                    content: node.content,
                },
            }) as Item
    )
}

export default RemoteDirectoryProvider
