import fs from 'node:fs/promises'
import path from 'node:path'
import { test as setup } from '@playwright/test'
import { CODY_VSCODE_ROOT_DIR } from './helpers'
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
        const resolvedGlobalTmpDir = path.resolve(CODY_VSCODE_ROOT_DIR, globalTmpDir)
        await fs.mkdir(resolvedGlobalTmpDir, { recursive: true })
        if (clearGlobalTmpDirParent) {
            const parentDir = path.resolve(resolvedGlobalTmpDir, '..')
            const currentDirName = path.parse(resolvedGlobalTmpDir).name
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
