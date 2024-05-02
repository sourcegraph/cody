import child_process from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { URI } from 'vscode-uri'

import { gitRemoteUrlsFromGitCli } from './repo-name-getter.node'

describe('gitRemoteUrlFromGitCli', () => {
    it('returns all remote URL when available', async () => {
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
            // TODO: find the right way to type this that is compatible with the `promisify` wrapper function.
            // skipping this for now to address to continue with higher priority work.
        }) as any)

        const uri = URI.file('path/to/file/foo.ts')
        expect(await gitRemoteUrlsFromGitCli(uri)).toEqual([
            'https://github.com/sourcegraph/cody',
            'https://github.com/foo/bar',
        ])
    })

    it('returns all fetch URLs if no push URL is available', async () => {
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
        expect(await gitRemoteUrlsFromGitCli(uri)).toEqual([
            'https://github.com/sourcegraph/cody',
            'https://github.com/foo/bar',
        ])
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
        expect(await gitRemoteUrlsFromGitCli(uri)).toBe(undefined)
    })
})
