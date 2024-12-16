import { TEAMS_DIRECTORY_PROVIDER_URI, TEAMS_REPOSITORY_PROVIDER_URI } from '@sourcegraph/cody-shared'
import type { OpenCtxProvider } from './types'

export const SourcegraphTeamsDirectoryProvider: OpenCtxProvider =
    createSourcegraphTeamsProvider('directory')
export const SourcegraphTeamsRepositoryProvider: OpenCtxProvider =
    createSourcegraphTeamsProvider('repository')

export function createSourcegraphTeamsProvider(type: 'directory' | 'repository'): OpenCtxProvider {
    return {
        providerUri: type === 'directory' ? TEAMS_DIRECTORY_PROVIDER_URI : TEAMS_REPOSITORY_PROVIDER_URI,

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
