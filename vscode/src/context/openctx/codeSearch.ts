import type { Item } from '@openctx/client'
import {
    CODE_SEARCH_PROVIDER_URI,
    type ContextItemOpenCtx,
    ContextItemSource,
    currentResolvedConfig,
    graphqlClient,
    isDefined,
    isError,
    pluralize,
} from '@sourcegraph/cody-shared'
import * as v from 'valibot'

const FileContentResultSchema = v.object({
    type: v.literal('file'),
    repoName: v.string(),
    filePath: v.string(),
    rev: v.string(),
})

const ResultSchema = v.variant('type', [FileContentResultSchema])
type Result = v.InferInput<typeof ResultSchema>

const MentionDataSchema = v.object({
    results: v.array(ResultSchema),
    tooltip: v.optional(v.string()),
})
type MentionData = v.InferInput<typeof MentionDataSchema>

import { URI } from 'vscode-uri'
import type { OpenCtxProvider } from './types'

export function createCodeSearchProvider(): OpenCtxProvider {
    return {
        providerUri: CODE_SEARCH_PROVIDER_URI,

        meta() {
            return {
                name: 'Code Search',
                mentions: {},
            }
        },

        async items({ mention }) {
            if (!v.is(MentionDataSchema, mention?.data)) {
                return []
            }
            const searchResultsMention = mention.data

            return (
                await Promise.all(
                    searchResultsMention.results
                        .map(result => {
                            if (result.type === 'file') {
                                return getFileItem(result.repoName, result.filePath, result.rev)
                            }
                            return null
                        })
                        .filter(isDefined)
                )
            ).flat()
        },
    }
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

/**
 * Create a context item for a set of code search results. If `originalMessage` is provided, it will be incorporated
 * into the tooltip.
 *
 * @param results The code search results to create a context item for.
 * @param originalMessage The original message that triggered the code search.
 * @returns The context item.
 */
export function createContextItem(results: Result[]): ContextItemOpenCtx {
    const uri = `search://${CODE_SEARCH_PROVIDER_URI}`
    return {
        type: 'openctx',
        provider: 'openctx',
        title: `${results.length} code search ${pluralize('result', results.length)}`,
        uri: URI.parse(uri),
        providerUri: CODE_SEARCH_PROVIDER_URI,
        mention: {
            uri,
            data: {
                results: results,
                tooltip: 'Code results make the organization, repo name, and code available as context',
            } satisfies MentionData,
        },
        source: ContextItemSource.User,
    }
}
