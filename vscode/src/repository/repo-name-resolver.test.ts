import { describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

import dedent from 'dedent'
import { gitRemoteUrlFromTreeWalk } from './repo-name-resolver'

describe('gitRemoteUrlFromTreeWalk', () => {
    it('finds the remote url in the .git/config file with one remote', async () => {
        const mockGitConfig = dedent`[core]
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
        `

        const textEncoder = new TextEncoder()

        const readFileMock = vi
            .spyOn(vscode.workspace.fs, 'readFile')
            .mockRejectedValueOnce('git config does not exist in this directory')
            .mockRejectedValueOnce('git config does not exist in this directory')
            .mockResolvedValueOnce(textEncoder.encode(mockGitConfig))

        const uri = URI.file('path/to/file/foo.ts')
        const remoteUrl = await gitRemoteUrlFromTreeWalk(uri)

        expect(readFileMock).toBeCalledTimes(3)
        expect(remoteUrl).toBe('https://github.com/sourcegraph/cody')
    })

    it('finds the remote url in the .git/config file with multiple remotes', async () => {
        const mockGitConfig = dedent`[core]
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
        `

        const textEncoder = new TextEncoder()

        const readFileMock = vi
            .spyOn(vscode.workspace.fs, 'readFile')
            .mockRejectedValueOnce('git config does not exist in this directory')
            .mockRejectedValueOnce('git config does not exist in this directory')
            .mockResolvedValueOnce(textEncoder.encode(mockGitConfig))

        const uri = URI.file('path/to/file/foo.ts')
        const remoteUrl = await gitRemoteUrlFromTreeWalk(uri)

        expect(readFileMock).toBeCalledTimes(3)
        expect(remoteUrl).toBe('https://github.com/username/yourproject.git')
    })

    it('returns `undefined` from the .git/config file with no remotes specified', async () => {
        const mockGitConfig = dedent`[core]
            repositoryformatversion = 0
            filemode = true
            bare = false
            logallrefupdates = true
            ignorecase = true
            precomposeunicode = true
        [branch "main"]
            merge = refs/heads/main
        `

        const textEncoder = new TextEncoder()

        const readFileMock = vi
            .spyOn(vscode.workspace.fs, 'readFile')
            .mockRejectedValueOnce('git config does not exist in this directory')
            .mockRejectedValueOnce('git config does not exist in this directory')
            .mockResolvedValueOnce(textEncoder.encode(mockGitConfig))

        const uri = URI.file('path/to/file/foo.ts')
        const remoteUrl = await gitRemoteUrlFromTreeWalk(uri)

        expect(readFileMock).toBeCalledTimes(3)
        expect(remoteUrl).toBe(undefined)
    })
    it('returns `undefined` if .git/config is not found', async () => {
        const readFileMock = vi
            .spyOn(vscode.workspace.fs, 'readFile')
            .mockRejectedValue('git config does not exist in this directory')

        const uri = URI.file('path/to/file/foo.ts')
        const remoteUrl = await gitRemoteUrlFromTreeWalk(uri)

        expect(readFileMock).toBeCalledTimes(5)
        expect(remoteUrl).toBe(undefined)
    })
})
