import { describe, expect, it } from 'vitest'

import { _getSymfPath } from './download-symf'

import { mkdtemp, open, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

describe('download-symf', () => {
    it('no parallel download', async () => {
        const dir = await mkdtemp(path.join(tmpdir(), 'symf-'))
        try {
            const makeEmptyFile = async (filePath: string) => {
                const file = await open(filePath, 'w')
                await file.close()
            }

            let mockDownloadSymfCalled = 0
            const mockDownloadSymf = async (op: {
                symfPath: string
                symfFilename: string
                symfURL: string
            }): Promise<void> => {
                mockDownloadSymfCalled++
                await makeEmptyFile(op.symfPath)
            }
            const symfPaths = await Promise.all(
                [...Array(10).keys()].map(() => _getSymfPath(dir, mockDownloadSymf))
            )
            expect(symfPaths.every(p => p === symfPaths[0])).toBeTruthy()
            expect(mockDownloadSymfCalled).toEqual(1)
        } finally {
            await rmdir(dir, { recursive: true })
        }
    })
})
