import fs from 'node:fs/promises'
import { test as _test } from '@playwright/test'
import { copy as copyExt } from 'fs-extra'
import 'node:http'
import 'node:https'
import path from 'node:path'
import type { TestContext, WorkerContext } from '.'
import { CODY_VSCODE_ROOT_DIR, retry } from '../../helpers'

export const kitchensinkFixture = _test.extend<TestContext, WorkerContext>({
    debugMode: [
        async ({}, use) => {
            use(!!process.env.PWDEBUG)
        },
        { scope: 'worker' },
    ],
    workspaceDir: [
        async ({ validOptions }, use, testInfo) => {
            const dir = await fs.mkdtemp(path.resolve(validOptions.globalTmpDir, 'test-workspace-'))

            await copyExt(path.resolve(CODY_VSCODE_ROOT_DIR, validOptions.templateWorkspaceDir), dir, {
                overwrite: true,
                preserveTimestamps: true,
                dereference: true, // we can't risk the test modifying the symlink
            })
            await use(dir)
            if (
                validOptions.keepRuntimeDirs === 'none' ||
                (validOptions.keepRuntimeDirs === 'failed' &&
                    ['failed', 'timedOut'].includes(testInfo.status ?? 'unknown'))
            ) {
                await retry(() => fs.rm(dir, { force: true, recursive: true }), 20, 500)
            }
        },
        {
            scope: 'test',
        },
    ],
})
