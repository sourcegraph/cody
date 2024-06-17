import fs from 'node:fs/promises'
import path from 'node:path'
import type { FullConfig } from 'playwright/test'

import { getAssetsDir, getTempVideoDir, rmSyncWithRetries } from '../helpers'

// Clear out the assets directory if running locally
export default async function (_: FullConfig) {
    // list all directories in the assets directory and remove all empty directories
    // and the videos-temp directory from each test directory
    for (const dir of await fs.readdir(getAssetsDir(''))) {
        const dirPath = path.join(getAssetsDir(''), dir)
        const stats = await fs.stat(dirPath)
        if (stats.isDirectory()) {
            const tempVideoDir = getTempVideoDir(dir)
            const files = await fs.readdir(dirPath)

            // if there is only one file in the directory, there were no failures,
            // so we can remove the whole directory
            const dirToRemove = files.length === 1 ? dirPath : tempVideoDir
            rmSyncWithRetries(dirToRemove, { recursive: true, force: true })
        }
    }
}
