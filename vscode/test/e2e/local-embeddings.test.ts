import * as child_process from 'child_process'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'

import { expect } from '@playwright/test'

import { SERVER_URL } from '../fixtures/mock-server'

import { sidebarSignin } from './common'
import * as helpers from './helpers'

async function withTempDir<T>(f: (dir: string) => Promise<T>): Promise<T> {
    // Create the temporary directory
    const dir = await fs.mkdtemp(await fs.realpath(os.tmpdir() + path.sep))
    try {
        return await f(dir)
    } finally {
        // Remove the temporary directory
        await fs.rm(dir, { recursive: true, force: true })
    }
}

function spawn(...args: Parameters<typeof child_process.spawn>): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = child_process.spawn(...args)
        child.once('close', (code, signal) => {
            if (code || signal) {
                reject(new Error(`child exited with code ${code}/signal ${signal}`))
            } else {
                resolve()
            }
        })
    })
}

// Reconfigured test for local embeddings:
// - treats http://localhost:49000 as dotcom
// - uses a temporary workspace that's a git repository
// - uses a temporary directory for local embeddings indexes
// - uses the stub/stub embeddings model
const test = helpers.test
    .extend<helpers.DotcomUrlOverride>({
        dotcomUrl: SERVER_URL,
    })
    .extend<helpers.WorkspaceDirectory>({
        // Playwright needs empty pattern to specify "no dependencies".
        // eslint-disable-next-line no-empty-pattern
        workspaceDirectory: async ({}, use) => {
            await withTempDir(async dir => {
                // Initialize a git repository there
                await spawn('git', ['init'], { cwd: dir })
                await spawn('git', ['config', 'user.name', 'Test User'], { cwd: dir })
                await spawn('git', ['config', 'user.email', 'test@example.host'], { cwd: dir })

                // Commit some content to the git repository.
                await Promise.all([
                    fs.writeFile(path.join(dir, 'README.md'), 'Prints an classic greeting'),
                    fs.writeFile(path.join(dir, 'main.c'), '#include <stdio.h> main() { printf("Hello, world.\\n"); }'),
                ])
                await spawn('git', ['add', 'README.md', 'main.c'], { cwd: dir })
                await spawn('git', ['commit', '-m', 'Initial commit'], { cwd: dir })

                await use(dir)
            })
        },
    })
    .extend<helpers.ExtraWorkspaceSettings>({
        // Playwright needs empty pattern to specify "no dependencies".
        // eslint-disable-next-line no-empty-pattern
        extraWorkspaceSettings: async ({}, use) => {
            await withTempDir(async dir =>
                use({
                    'cody.testing.localEmbeddingsModel': 'stub/stub',
                    'cody.testing.localEmbeddingsIndexLibraryPath': dir,
                })
            )
        },
    })

// test('should create and tear down a git repository', async ({}) => {})

test('should create and search a local embeddings index', async ({ page, sidebar }) => {
    // Open a file from the file picker
    await page.keyboard.down('Control')
    await page.keyboard.down('Shift')
    await page.keyboard.press('P')
    await page.keyboard.up('Shift')
    await page.keyboard.up('Control')
    await page.keyboard.type('main.c\n')

    await sidebarSignin(page, sidebar)
    await page.getByRole('button', { name: 'New Chat' }).click()

    // Find the chat frame
    const chatFrame = page.frameLocator('iframe.webview').last().frameLocator('iframe')
    const enhancedContextButton = chatFrame.getByTitle('Configure Enhanced Context')
    await enhancedContextButton.click()

    const enableEmbeddingsButton = chatFrame.getByText('Enable Embeddings')
    await expect(enableEmbeddingsButton).toBeVisible({ timeout: 60000 })
    await enableEmbeddingsButton.click()
})
