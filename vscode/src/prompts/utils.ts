import { firstValueFrom, isError, pendingOperation } from '@sourcegraph/cody-shared'
import { type RemoteRepo, remoteReposForAllWorkspaceFolders } from '../repository/remoteRepos'
import type { PromptHydrationInitialContext } from './prompt-hydration'

export async function getCurrentRepositoryInfo(
    initialContext: PromptHydrationInitialContext
): Promise<RemoteRepo | null> {
    const initialContextRepository = initialContext.find(item => item.type === 'repository')

    if (initialContextRepository) {
        return {
            id: initialContextRepository.repoID,
            name: initialContextRepository.repoName,
        }
    }

    const workspaceFolders = await firstValueFrom(remoteReposForAllWorkspaceFolders)

    if (workspaceFolders === pendingOperation || isError(workspaceFolders) || !workspaceFolders[0]) {
        return null
    }

    return workspaceFolders[0]
}
