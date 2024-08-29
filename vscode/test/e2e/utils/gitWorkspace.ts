import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import * as mockServer from '../../fixtures/mock-server'

import path from 'node:path'
import {
    type DotcomUrlOverride,
    type WorkspaceDirectory,
    test as baseTest,
    withTempDir,
} from '../helpers'

// Reconfigured test with Git enabled
export const testGitWorkspace = baseTest
    .extend<DotcomUrlOverride>({
        dotcomUrl: mockServer.SERVER_URL,
    })
    .extend<WorkspaceDirectory>({
        // biome-ignore lint/correctness/noEmptyPattern: Playwright needs empty pattern to specify "no dependencies".
        workspaceDirectory: async ({}, use) => {
            await withTempDir(async dir => {
                // Initialize a git repository there
                await runGit(['init'], { cwd: dir })
                await runGit(['config', 'user.name', 'Test User'], { cwd: dir })
                await runGit(['config', 'user.email', 'test@example.host'], { cwd: dir })

                // Add Cody ignore
                await fs.mkdir(path.join(dir, '.cody'), { recursive: true })
                await fs.writeFile(path.join(dir, '.cody', 'ignore'), 'ignored.js')

                // Add empty files to change later
                await Promise.all([
                    fs.writeFile(path.join(dir, 'index.js'), ''),
                    fs.writeFile(path.join(dir, 'ignored.js'), ''),
                ])

                // Commit initial files
                await runGit(['add', '.'], { cwd: dir })
                await runGit(['commit', '-m', 'Initial commit'], {
                    cwd: dir,
                })

                // Add some content to try to commit in our tests
                await Promise.all([
                    fs.writeFile(path.join(dir, 'index.js'), '// Hello World'),
                    fs.writeFile(path.join(dir, 'ignored.js'), '// Ignore me!'),
                ])

                await use(dir)
            })
        },
    })

/** Run 'git' and wait for the process to exit. */
async function runGit(args: string[], options?: any) {
    const proc = spawn('git', args, options)
    return new Promise(resolve => proc.on('close', resolve))
}
