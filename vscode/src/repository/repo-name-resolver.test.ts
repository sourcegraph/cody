import { afterEach, describe, expect, it, vi } from 'vitest'

import {
    AUTH_STATUS_FIXTURE_AUTHED,
    AUTH_STATUS_FIXTURE_AUTHED_DOTCOM,
    CLIENT_CAPABILITIES_FIXTURE,
    firstResultFromOperation,
    graphqlClient,
    mockAuthStatus,
    mockClientCapabilities,
    mockResolvedConfig,
} from '@sourcegraph/cody-shared'

import { Uri } from 'vscode'
import * as vscode from 'vscode'
import * as remoteUrlsFromParentDirs from './remote-urls-from-parent-dirs'
import { RepoNameResolver } from './repo-name-resolver'
import { mockFsCalls } from './test-helpers'

vi.mock('../services/AuthProvider')

describe('getRepoNamesContainingUri', () => {
    afterEach(() => {
        vi.resetAllMocks()
    })

    function prepareEnterpriseMocks() {
        const repoNameResolver = new RepoNameResolver()
        mockAuthStatus(AUTH_STATUS_FIXTURE_AUTHED)
        mockResolvedConfig({ auth: {} })
        mockClientCapabilities(CLIENT_CAPABILITIES_FIXTURE)

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

        return {
            repoNameResolver,
            fileUri,
            getRepoNameGraphQLMock,
        }
    }
    it('resolves the repo name using graphql for enterprise accounts', async () => {
        const { repoNameResolver, fileUri, getRepoNameGraphQLMock } = prepareEnterpriseMocks()
        const repoNames = await firstResultFromOperation(
            repoNameResolver.getRepoNamesContainingUri(fileUri)
        )

        expect(repoNames).toEqual(['sourcegraph/cody'])
        expect(getRepoNameGraphQLMock).toBeCalledTimes(1)
    })

    it('reuses cached API responses that are needed to resolve enterprise repo names', async () => {
        const { repoNameResolver, fileUri, getRepoNameGraphQLMock } = prepareEnterpriseMocks()

        const repoNames = await firstResultFromOperation(
            repoNameResolver.getRepoNamesContainingUri(fileUri)
        )
        const shouldReuseCachedValue = await firstResultFromOperation(
            repoNameResolver.getRepoNamesContainingUri(fileUri)
        )

        expect(repoNames).toEqual(['sourcegraph/cody'])
        expect(shouldReuseCachedValue).toEqual(repoNames)
        expect(getRepoNameGraphQLMock).toBeCalledTimes(1)
    })

    it('resolves the repo name using local conversion function for PLG accounts', async () => {
        const repoNameResolver = new RepoNameResolver()
        mockAuthStatus(AUTH_STATUS_FIXTURE_AUTHED_DOTCOM)

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

        expect(
            await firstResultFromOperation(repoNameResolver.getRepoNamesContainingUri(fileUri))
        ).toEqual(['github.com/sourcegraph/cody'])
        expect(getRepoNameGraphQLMock).not.toBeCalled()
    })

    it('resolves the repo name repo: workspace folders if any', async () => {
        vi.spyOn(vscode.workspace, 'getWorkspaceFolder').mockReturnValue({
            uri: Uri.parse('repo:my/repo'),
            name: 'repo',
            index: 0,
        })

        const repoNameResolver = new RepoNameResolver()
        mockAuthStatus(AUTH_STATUS_FIXTURE_AUTHED)

        const file = Uri.parse('repo:my/repo/my/file.txt')
        expect(await firstResultFromOperation(repoNameResolver.getRepoNamesContainingUri(file))).toEqual(
            ['my/repo']
        )
    })
})
