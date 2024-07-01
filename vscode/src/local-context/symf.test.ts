import { mkdtemp, open, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { getOSArch } from '../os'
import { _config, _getNamesForPlatform, _upsertSymfForPlatform } from './download-symf'
import { downloadFile } from './utils'

//@ts-ignore
_config.FILE_LOCK_RETRY_DELAY = 1

vi.mock('./utils', async importOriginal => {
    //use the vscode mock inside this mock too
    const mod = await importOriginal<typeof import('./utils')>()
    let firstDownload = true
    return {
        ...mod,
        downloadFile: vi.fn(async (url: string, dest: string) => {
            // we abandon the first download
            if (firstDownload) {
                await makeEmptyFile(dest)
                firstDownload = false
                throw new Error('Test Mock Deliberate Abandon')
            }
            await sleep(2)
            // make an empty file
            await makeEmptyFile(dest)
        }),
        unzip: vi.fn(async (zipPath: string, dest: string) => {
            await sleep(2)
            // just check the zip file exists first
            if (!(await mod.fileExists(zipPath))) {
                throw new Error("File doesn't exist")
            }
            // we ensure that at leats the expected file exists
            const { platform, arch } = getOSArch()
            const { symfUnzippedFilename } = _getNamesForPlatform(platform!, arch!)
            const symfUnzippedPath = path.join(dest, symfUnzippedFilename)
            await makeEmptyFile(symfUnzippedPath)
        }),
    }
})

describe('upsertSymfForPlatform', () => {
    // NOTE: This really only checks downloads in the same Node process Instead
    // we probably want to mock the fs and network layer directly and ensure
    // that this works regardless of Mutex locks
    it('prevents parallel downloads', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'symf-'))
        try {
            // we first create a "abandoned" download so that we can ensure that
            // after some expiration time one of the processes will forcefully
            // download regardless
            const abandonedDownload = _upsertSymfForPlatform(dir)
            expect(await abandonedDownload).toBeNull()

            vi.mocked(downloadFile).mockClear()

            // we now start parallel async functions
            const results = await Promise.all([
                _upsertSymfForPlatform(dir),
                _upsertSymfForPlatform(dir),
                _upsertSymfForPlatform(dir),
                _upsertSymfForPlatform(dir),
            ])
            // only one actual download should have happened
            expect(downloadFile).toHaveBeenCalledOnce()

            // expect all results to be the same and valid strings
            expect(new Set(results).size).toBe(1)
            expect(results[0]).toBeTruthy()
        } finally {
            await rm(dir, { recursive: true })
        }
    })
})

async function makeEmptyFile(filePath: string) {
    const file = await open(filePath, 'w')
    await file.close()
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}
