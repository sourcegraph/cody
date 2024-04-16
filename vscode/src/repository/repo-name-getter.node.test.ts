import child_process from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { URI } from 'vscode-uri'

import { gitRemoteUrlFromGitCli } from './repo-name-getter.node'

describe('gitRemoteUrlFromGitCli', () => {
    it('returns the first remote push URL when available', async () => {
        vi.spyOn(child_process, 'exec').mockImplementation(((
            _cmd: string,
            _config: unknown,
            callback: (error: null | Error, res: { stdout: string; stderr: string }) => void
        ) => {
            callback(null, {
                stdout: `
                    origin  https://github.com/sourcegraph/cody (fetch)
                    origin  https://github.com/sourcegraph/cody (push)
                    upstream  https://github.com/foo/bar (fetch)
                    upstream  https://github.com/foo/bar (push)
                `,
                stderr: '',
            })
        }) as any)

        const uri = URI.file('path/to/file/foo.ts')
        expect(await gitRemoteUrlFromGitCli(uri)).toBe('https://github.com/sourcegraph/cody')
    })

    it('returns the first remote fetch URL if no push URL is available', async () => {
        vi.spyOn(child_process, 'exec').mockImplementation(((
            _cmd: string,
            _config: unknown,
            callback: (error: null | Error, res: { stdout: string; stderr: string }) => void
        ) => {
            callback(null, {
                stdout: `
                    origin  https://github.com/sourcegraph/cody (fetch)
                    upstream  https://github.com/foo/bar (fetch)
                `,
                stderr: '',
            })
        }) as any)

        const uri = URI.file('path/to/file/foo.ts')
        expect(await gitRemoteUrlFromGitCli(uri)).toBe('https://github.com/sourcegraph/cody')
    })

    it('returns `undefined` when the remote list is empty', async () => {
        vi.spyOn(child_process, 'exec').mockImplementation(((
            _cmd: string,
            _config: unknown,
            callback: (error: null | Error, res: { stdout: string; stderr: string }) => void
        ) => {
            callback(null, {
                stdout: '',
                stderr: '',
            })
        }) as any)

        const uri = URI.file('path/to/file/foo.ts')
        expect(await gitRemoteUrlFromGitCli(uri)).toBe(undefined)
    })
})
