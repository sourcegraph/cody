import type { Item } from '@openctx/client'
import {
    REMOTE_REPOSITORY_PROVIDER_URI,
    currentResolvedConfig,
    graphqlClient,
    isError,
} from '@sourcegraph/cody-shared'

import { getRepositoryMentions } from './common/get-repository-mentions'
import type { OpenCtxProvider } from './types'

const RemoteRepositorySearch: OpenCtxProvider = createRemoteRepositoryProvider()

export function createRemoteRepositoryProvider(customTitle?: string): OpenCtxProvider {
    return {
        providerUri: REMOTE_REPOSITORY_PROVIDER_URI,

        meta() {
            return { name: customTitle ?? 'Remote Repositories', mentions: {} }
        },

        async mentions({ query }) {
            try {
                return await getRepositoryMentions(query ?? '', REMOTE_REPOSITORY_PROVIDER_URI)
            } catch (error) {
                return []
            }
        },

        async items({ message, mention }) {
            if (!mention?.data?.repoId || !message) {
                return []
            }

            const { auth } = await currentResolvedConfig()
            const dataOrError = await graphqlClient.contextSearch({
                repoIDs: [mention?.data?.repoId as string],
                query: message,
            })
            if (isError(dataOrError) || dataOrError === null) {
                return []
            }

            return dataOrError.map(
                node =>
                    ({
                        url: auth.serverEndpoint + node.uri.toString(),
                        title: node.path,
                        ai: {
                            content: node.content,
                        },
                    }) as Item
            )
        },
    }
}

export default RemoteRepositorySearch
