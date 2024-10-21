import fs from 'node:fs/promises'
import 'node:http'
import 'node:https'
import path from 'node:path'
import { test as _test } from '@playwright/test'
import { copy as copyExt } from 'fs-extra'
import type { TestContext, WorkerContext } from '.'
import { CODY_VSCODE_ROOT_DIR, retry } from '../../helpers'

export const kitchensinkFixture = _test.extend<TestContext, WorkerContext>({
    gitconfigPath: [
        async ({ validWorkerOptions }, use, testInfo) => {
            const configPath = path.resolve(
                validWorkerOptions.globalTmpDir,
                `${testInfo.parallelIndex}_git_config`
            )
            await fs.writeFile(
                configPath,
                `
[user]
    name = Test User ${testInfo.parallelIndex}
    email = test_{testInfo.parallelIndex}@sourcegraph.com
[init]
    defaultBranch = main
`
            )

            use(configPath)
        },
        { scope: 'worker' },
    ],
    workspaceDir: [
        async ({ validOptions, gitconfigPath }, use, testInfo) => {
            process.env.GIT_CONFIG_SYSTEM = '/dev/null'
            process.env.GIT_CONFIG_GLOBAL = gitconfigPath

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
