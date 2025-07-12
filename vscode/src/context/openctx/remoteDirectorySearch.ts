import { REMOTE_DIRECTORY_PROVIDER_URI, currentResolvedConfig } from '@sourcegraph/cody-shared'

import type { Item, Mention } from '@openctx/client'
import { graphqlClient, isDefined, isError } from '@sourcegraph/cody-shared'
import { getRepositoryMentions } from './common/get-repository-mentions'
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
                // Check if the query contains branch specification (@branch)
                if (query?.includes('@')) {
                    // Handle both @branch and @branch/directory formats
                    const trimmedQuery = query?.trim() ?? ''
                    const slashIndex = trimmedQuery.lastIndexOf('/')

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

            return await getDirectoryMentions(repoName, directoryPath.trim())
        },

        async items({ mention, message }) {
            if (!mention?.data?.repoName || !mention?.data?.directoryPath || !message) {
                return []
            }

            return await getDirectoryItem(
                message,
                mention.data.repoName as string,
                mention.data.directoryPath as string,
                mention.data.rev as string
            )
        },
    }
}

async function getDirectoryMentions(repoName: string, directoryPath?: string): Promise<Mention[]> {
    // Parse repo name and optional branch (format: repo@branch or repo:directory@branch)
    const [repoNamePart, branchPart] = extractRepoAndBranch(repoName)
    const repoRe = `^${escapeRegExp(repoNamePart)}$`
    const directoryRe = directoryPath ? escapeRegExp(directoryPath) : ''
    const repoWithBranch = branchPart ? `${repoRe}@${branchPart}` : repoRe

    // For root directory search, use a pattern that finds top-level directories
    const filePattern = directoryPath ? `${directoryRe}.*\\/.*` : '[^/]+\\/.*'
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

            const url = `${serverEndpoint.replace(/\/$/, '')}${result.file.url}`

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

async function getDirectoryItem(
    query: string,
    repoName: string,
    directoryPath: string,
    revision?: string
): Promise<Item[]> {
    const dataOrError = await graphqlClient.getDirectoryContents(repoName, directoryPath, revision)

    if (isError(dataOrError) || dataOrError === null) {
        return []
    }

    const entries = dataOrError.repository?.commit?.tree?.entries || []
    const {
        auth: { serverEndpoint },
    } = await currentResolvedConfig()

    return entries
        .filter(entry => entry.content && !entry.isDirectory) // Only include files with content
        .map(entry => ({
            url: `${serverEndpoint.replace(/\/$/, '')}${entry.url}`,
            title: entry.path,
            ai: {
                content: entry.content,
            },
        })) as Item[]
}

export default RemoteDirectoryProvider
