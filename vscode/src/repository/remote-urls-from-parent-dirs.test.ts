import { describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

import { gitRemoteUrlsFromParentDirs } from './remote-urls-from-parent-dirs'
import { mockFsCalls } from './test-helpers'

describe('gitRemoteUrlsFromParentDirs', () => {
    it('finds remote urls in the `.git/config` file with one remote', async () => {
        const { fileUri, statMock, readFileMock } = mockFsCalls({
            filePath: '/repo/src/dir/foo.ts',
            gitRepoPath: '/repo',
            gitConfig: `
                [core]
                    repositoryformatversion = 0
                    filemode = true
                    bare = false
                    logallrefupdates = true
                    ignorecase = true
                [remote "origin"]
                    url = https://github.com/sourcegraph/cody
                    fetch = +refs/heads/*:refs/remotes/origin/*
                [branch "main"]
                    remote = origin
                    merge = refs/heads/main
            `,
        })

        const remoteUrls = await gitRemoteUrlsFromParentDirs(fileUri)

        expect(statMock).toBeCalledTimes(4)
        expect(readFileMock).toBeCalledTimes(1)
        expect(remoteUrls).toEqual(['https://github.com/sourcegraph/cody'])
    })

    it('finds all remote urls in the .git/config file with multiple remotes', async () => {
        const { fileUri } = mockFsCalls({
            filePath: '/repo/src/dir/foo.ts',
            gitRepoPath: '/repo',
            gitConfig: `
                [core]
                    repositoryformatversion = 0
                    filemode = true
                    bare = false
                    logallrefupdates = true
                    ignorecase = true
                    precomposeunicode = true
                [remote "origin"]
                    url = https://github.com/username/yourproject.git
                    fetch = +refs/heads/*:refs/remotes/origin/*
                    pushurl = https://github.com/username/yourproject.git
                [remote "upstream"]
                    url = https://github.com/originalauthor/yourproject.git
                    fetch = +refs/heads/*:refs/remotes/upstream/*
                [remote "backup"]
                    url = git@backupserver:repositories/yourproject.git
                    fetch = +refs/heads/*:refs/remotes/backup/*
                [branch "main"]
                    remote = origin
                    merge = refs/heads/main
                [branch "develop"]
                    remote = origin
                    merge = refs/heads/develop
            `,
        })

        const remoteUrls = await gitRemoteUrlsFromParentDirs(fileUri)
        expect(remoteUrls).toEqual([
            'https://github.com/username/yourproject.git',
            'https://github.com/originalauthor/yourproject.git',
            'git@backupserver:repositories/yourproject.git',
        ])
    })

    it('returns `undefined` from the .git/config file with no remotes specified', async () => {
        const { fileUri } = mockFsCalls({
            filePath: '/repo/src/dir/foo.ts',
            gitRepoPath: '/repo',
            gitConfig: `
                [core]
                    repositoryformatversion = 0
                    filemode = true
                    bare = false
                    logallrefupdates = true
                    ignorecase = true
                    precomposeunicode = true
                [branch "main"]
                    merge = refs/heads/main
            `,
        })

        const remoteUrls = await gitRemoteUrlsFromParentDirs(fileUri)
        expect(remoteUrls).toBe(undefined)
    })

    it('returns `undefined` if .git/config is not found', async () => {
        const statMock = vi
            .spyOn(vscode.workspace.fs, 'stat')
            .mockResolvedValueOnce({ type: vscode.FileType.File } as vscode.FileStat)
            .mockRejectedValue(new vscode.FileSystemError('file does not exist'))

        const uri = URI.file('repo/src/dir/foo.ts')
        const remoteUrls = await gitRemoteUrlsFromParentDirs(uri)

        expect(statMock).toBeCalledTimes(5)
        expect(remoteUrls).toBe(undefined)
    })

    it('finds remote urls in a submodule', async () => {
        const { fileUri } = mockFsCalls({
            filePath: '/repo/submodule/foo.ts',
            gitRepoPath: '/repo',
            gitSubmodule: {
                path: '/repo/submodule',
                gitFile: 'gitdir: ../.git/modules/submodule',
                gitConfig: `
                    [core]
                        repositoryformatversion = 0
                        filemode = true
                    [remote "origin"]
                        url = https://github.com/example/submodule.git
                        fetch = +refs/heads/*:refs/remotes/origin/*
                `,
            },
            gitConfig: `
                [core]
                    repositoryformatversion = 0
                    filemode = true
                [remote "origin"]
                    url = https://github.com/example/root.git
                    fetch = +refs/heads/*:refs/remotes/origin/*
            `,
        })

        const remoteUrls = await gitRemoteUrlsFromParentDirs(fileUri)
        expect(remoteUrls).toEqual(['https://github.com/example/submodule.git'])
    })

    it('finds remote urls in nested submodules', async () => {
        const { fileUri } = mockFsCalls({
            filePath: '/repo/submodule/nested/foo.ts',
            gitRepoPath: '/repo',
            gitSubmodule: {
                path: '/repo/submodule/nested',
                gitFile: 'gitdir: ../../.git/modules/submodule/modules/nested',
                gitConfig: `
                    [core]
                        repositoryformatversion = 0
                        filemode = true
                    [remote "origin"]
                        url = https://github.com/nested/submodule.git
                        fetch = +refs/heads/*:refs/remotes/origin/*
                `,
            },
            gitConfig: `
                [core]
                    repositoryformatversion = 0
                    filemode = true
                [remote "origin"]
                    url = https://github.com/example/nested.git
                    fetch = +refs/heads/*:refs/remotes/origin/*
            `,
        })

        const remoteUrls = await gitRemoteUrlsFromParentDirs(fileUri)
        expect(remoteUrls).toEqual(['https://github.com/nested/submodule.git'])
    })

    it('returns `undefined` for a submodule without a remote url', async () => {
        const { fileUri } = mockFsCalls({
            filePath: '/repo/submodule/foo.ts',
            gitRepoPath: '/repo',
            gitSubmodule: {
                path: '/repo/submodule',
                gitFile: 'gitdir: ../.git/modules/submodule',
                gitConfig: `
                    [core]
                        repositoryformatversion = 0
                        filemode = true
                `,
            },
            gitConfig: `
                [core]
                    repositoryformatversion = 0
                    filemode = true
                [remote "origin"]
                    url = https://github.com/example/nested.git
                    fetch = +refs/heads/*:refs/remotes/origin/*
            `,
        })

        const remoteUrls = await gitRemoteUrlsFromParentDirs(fileUri)
        expect(remoteUrls).toBe(undefined)
    })
})
