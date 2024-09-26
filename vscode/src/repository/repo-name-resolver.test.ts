import { describe, expect, it, vi } from 'vitest'

import { AUTH_STATUS_FIXTURE_AUTHED, graphqlClient, mockAuthStatus } from '@sourcegraph/cody-shared'

import * as remoteUrlsFromParentDirs from './remote-urls-from-parent-dirs'
import { RepoNameResolver } from './repo-name-resolver'
import { mockFsCalls } from './test-helpers'

vi.mock('../services/AuthProvider')

describe('getRepoNamesFromWorkspaceUri', () => {
    it('resolves the repo name using graphql for enterprise accounts', async () => {
        const repoNameResolver = new RepoNameResolver()
        mockAuthStatus(AUTH_STATUS_FIXTURE_AUTHED)

        vi.spyOn(remoteUrlsFromParentDirs, 'gitRemoteUrlsForUri').mockResolvedValue([
            'git@github.com:sourcegraph/cody.git',
        ])

        const { fileUri } = mockFsCalls({
            filePath: '/repo/submodule/foo.ts',
            gitRepoPath: '/repo',
            gitConfig: `
                [core]
                    repositoryformatversion = 0
                    filemode = true
                [remote "origin"]
                    url = https://github.com/sourcegraph/cody.git
                    fetch = +refs/heads/*:refs/remotes/origin/*
            `,
        })

        const getRepoNameGraphQLMock = vi
            .spyOn(graphqlClient, 'getRepoName')
            .mockResolvedValue('sourcegraph/cody')

        expect(await repoNameResolver.getRepoNamesContainingUri(fileUri)).toEqual(['sourcegraph/cody'])
        expect(getRepoNameGraphQLMock).toBeCalledTimes(1)
    })

    it('resolves the repo name using local conversion function for PLG accounts', async () => {
        const repoNameResolver = new RepoNameResolver()
        mockAuthStatus()

        vi.spyOn(remoteUrlsFromParentDirs, 'gitRemoteUrlsForUri').mockResolvedValue([
            'git@github.com:sourcegraph/cody.git',
        ])

        const { fileUri } = mockFsCalls({
            filePath: '/repo/submodule/foo.ts',
            gitRepoPath: '/repo',
            gitConfig: `
                [core]
                    repositoryformatversion = 0
                    filemode = true
                [remote "origin"]
                    url = https://github.com/sourcegraph/cody.git
                    fetch = +refs/heads/*:refs/remotes/origin/*
            `,
        })

        const getRepoNameGraphQLMock = vi
            .spyOn(graphqlClient, 'getRepoName')
            .mockResolvedValue('sourcegraph/cody')

        expect(await repoNameResolver.getRepoNamesContainingUri(fileUri)).toEqual([
            'github.com/sourcegraph/cody',
        ])
        expect(getRepoNameGraphQLMock).not.toBeCalled()
    })
})
