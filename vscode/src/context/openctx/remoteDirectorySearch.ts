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
                return await getRepositoryMentions(query?.trim() ?? '', REMOTE_DIRECTORY_PROVIDER_URI)
            }

            return await getDirectoryMentions(repoName, directoryPath.trim())
        },

        async items({ mention, message }) {
            if (!mention?.data?.repoID || !mention?.data?.directoryPath || !message) {
                return []
            }

            return await getDirectoryItem(
                message,
                mention.data.repoID as string,
                mention.data.directoryPath as string
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
    const query = `repo:${repoWithBranch} file:${directoryRe}.*\/.* select:file.directory count:10`

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

async function getDirectoryItem(query: string, repoID: string, directoryPath: string): Promise<Item[]> {
    const dataOrError = await graphqlClient.contextSearch({
        repoIDs: [repoID],
        query,
        filePatterns: [`^${directoryPath}.*`],
    })

    if (isError(dataOrError) || dataOrError === null) {
        return []
    }

    return dataOrError.map(
        node =>
            ({
                url: node.uri.toString(),
                title: node.path,
                ai: {
                    content: node.content,
                },
            }) as Item
    )
}

export default RemoteDirectoryProvider
