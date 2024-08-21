import { REMOTE_DIRECTORY_PROVIDER_URI } from '@sourcegraph/cody-shared'
import { getRepoMentions } from './remoteFileSearch'

import { getDirectoryItem, getDirectoryMentions } from './currentRepositoryDirectorySearch'
import type { OpenCtxProvider } from './types'

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
                return await getRepoMentions(query?.trim())
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

export default RemoteDirectoryProvider
