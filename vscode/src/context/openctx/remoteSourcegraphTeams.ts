import {
    WORKSPACE_DIRECTORY_PROVIDER_URI,
    WORKSPACE_REPOSITORY_PROVIDER_URI,
} from '@sourcegraph/cody-shared'
import type { OpenCtxProvider } from './types'

export const RemoteWorkspaceDirectoryProvider: OpenCtxProvider =
    createRemoteWorkspaceProvider('directory')
export const RemoteWorkspaceRepositoryProvider: OpenCtxProvider =
    createRemoteWorkspaceProvider('repository')

export function createRemoteWorkspaceProvider(type: 'directory' | 'repository'): OpenCtxProvider {
    return {
        providerUri:
            type === 'directory' ? WORKSPACE_DIRECTORY_PROVIDER_URI : WORKSPACE_REPOSITORY_PROVIDER_URI,

        meta() {
            return {
                name: type === 'directory' ? 'Remote Directory' : 'Remote Repository',
                mentions: {},
            }
        },

        async mentions() {
            return []
        },

        async items() {
            return []
        },
    }
}
