import fs from 'node:fs/promises'
import path from 'node:path'
import { test as setup } from '@playwright/test'
import type { WorkerOptions } from './vscody'
export interface TmpDirOptions {
    clearGlobalTmpDirParent: boolean
}

// biome-ignore lint/complexity/noBannedTypes: <explanation>
setup.extend<{}, TmpDirOptions & WorkerOptions>({
    globalTmpDir: ['', { scope: 'worker', option: true }],
    clearGlobalTmpDirParent: [false, { scope: 'worker', option: true }],
})('tmpdir', async ({ globalTmpDir, clearGlobalTmpDirParent }) => {
    if (globalTmpDir) {
        await fs.mkdir(globalTmpDir, { recursive: true })
        if (clearGlobalTmpDirParent) {
            const parentDir = path.resolve(process.cwd(), globalTmpDir, '..')
            const currentDirName = path.parse(globalTmpDir).name
            const promises = []
            for (const dirName of await fs.readdir(parentDir)) {
                if (dirName !== currentDirName) {
                    promises.push(
                        fs.rm(path.resolve(parentDir, dirName), { recursive: true, force: true })
                    )
                }
            }
            if (promises.length > 0) {
                await Promise.all(promises)
            }
        }
    }
})
