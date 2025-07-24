import type { Item, Mention } from '@openctx/client'
import {
    REMOTE_FILE_PROVIDER_URI,
    currentResolvedConfig,
    displayPathBasename,
    graphqlClient,
    isDefined,
    isError,
} from '@sourcegraph/cody-shared'
import { URI } from 'vscode-uri'

import { getBranchMentions } from './common/branch-mentions'
import { getRepositoryMentions } from './common/get-repository-mentions'
import type { OpenCtxProvider } from './types'

const RemoteFileProvider = createRemoteFileProvider()

export function createRemoteFileProvider(customTitle?: string): OpenCtxProvider {
    return {
        providerUri: REMOTE_FILE_PROVIDER_URI,

        meta() {
            return {
                name: customTitle ?? 'Remote Files',
                mentions: {},
            }
        },

        async mentions({ query }) {
            const [repoName, filePath] = query?.split(':') || []

            if (!query?.includes(':') || !repoName.trim()) {
                return await getRepositoryMentions(query?.trim() ?? '', REMOTE_FILE_PROVIDER_URI)
            }

            // Check if we should show branch suggestions for this repository
            // Check if repoName contains a branch (repo@branch format from mention menu)
            if (repoName.includes('@')) {
                // This is "repo@branch:" - show file listing for this branch
                const [repoNamePart, branch] = repoName.split('@')
                return await getFileMentions(repoNamePart, filePath.trim(), branch)
            }
            return await getFileBranchMentions(repoName)
        },

        async items({ mention }) {
            if (!mention?.data?.repoName || !mention?.data?.filePath) {
                return []
            }

            return await getFileItem(
                mention.data.repoName as string,
                mention.data.filePath as string,
                mention.data.rev as string
            )
        },
    }
}

async function getFileMentions(
    repoName: string,
    filePath?: string,
    branch?: string
): Promise<Mention[]> {
    const repoRe = `^${escapeRegExp(repoName)}$`
    const fileRe = filePath ? escapeRegExp(filePath) : '^.*$'
    const branchPart = branch ? `@${escapeRegExp(branch)}` : ''
    const query = `repo:${repoRe}${branchPart} file:${fileRe} type:file count:10`

    const { auth } = await currentResolvedConfig()
    const dataOrError = await graphqlClient.searchFileMatches(query)

    if (isError(dataOrError) || dataOrError === null) {
        return []
    }

    return dataOrError.search.results.results
        .map(result => {
            if (result.__typename !== 'FileMatch') {
                return null
            }

            const url = `${auth.serverEndpoint.replace(/\/$/, '')}${result.file.url}`

            const basename = displayPathBasename(URI.parse(result.file.path))

            return {
                uri: url,
                title: basename,
                description: result.file.path,
                data: {
                    repoName: result.repository.name,
                    rev: result.file.commit.oid,
                    filePath: result.file.path,
                    branch: branch,
                },
            } satisfies Mention
        })
        .filter(isDefined)
}

async function getFileBranchMentions(repoName: string, branchQuery?: string): Promise<Mention[]> {
    const branchMentions = await getBranchMentions({
        repoName,
        providerUri: REMOTE_FILE_PROVIDER_URI,
        branchQuery,
    })

    // If no branch mentions found, fallback to file search
    if (branchMentions.length === 0) {
        return await getFileMentions(repoName, '')
    }

    return branchMentions
}

async function getFileItem(repoName: string, filePath: string, rev = 'HEAD'): Promise<Item[]> {
    const { auth } = await currentResolvedConfig()
    const dataOrError = await graphqlClient.getFileContents(repoName, filePath, rev)

    if (isError(dataOrError)) {
        return []
    }

    const file = dataOrError?.repository?.commit?.file
    if (!file) {
        return []
    }

    const url = `${auth.serverEndpoint.replace(/\/$/, '')}${file.url}`

    return [
        {
            url,
            title: `${repoName}/${file.path}`,
            ai: {
                content: file.content,
            },
        },
    ] satisfies Item[]
}

export function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export default RemoteFileProvider
