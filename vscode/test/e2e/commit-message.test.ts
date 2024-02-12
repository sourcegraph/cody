import { promises as fs } from 'fs'
import { spawn } from 'child_process'
import * as mockServer from '../fixtures/mock-server'

import { sidebarSignin } from './common'
import {
    type DotcomUrlOverride,
    test as baseTest,
    type WorkspaceDirectory,
    withTempDir,
    assertEvents,
} from './helpers'
import { expect } from 'playwright/test'
import path from 'path'
import { URI } from 'vscode-uri'

// Reconfigured test to enable features within the Git extension (initialise a Git repo)
const test = baseTest
    .extend<DotcomUrlOverride>({
        dotcomUrl: mockServer.SERVER_URL,
    })
    .extend<WorkspaceDirectory>({
        // biome-ignore lint/correctness/noEmptyPattern: Playwright needs empty pattern to specify "no dependencies".
        workspaceDirectory: async ({}, use) => {
            await withTempDir(async dir => {
                // Initialize a git repository there
                await spawn('git', ['init'], { cwd: dir })

                // Add Cody ignore
                await fs.mkdir(URI.file(path.join(dir, '.cody')).path, { recursive: true })
                await fs.writeFile(URI.file(path.join(dir, '.cody', 'ignore')).path, 'ignored.js')

                // Add some content
                await Promise.all([
                    fs.writeFile(URI.file(path.join(dir, 'index.js')).path, '// Hello World'),
                    fs.writeFile(URI.file(path.join(dir, 'ignored.js')).path, '// Ignore me!'),
                ])

                await use(dir)
            })
        },
    })

test.beforeEach(() => {
    mockServer.resetLoggedEvents()
})

test('commit message generation - happy path', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the Source Control view
    await page
        .getByLabel(/Source Control/)
        .nth(2)
        .click()

    // Check the change is showing as a Git change
    const gitChange = page.getByLabel('index.js, Untracked')
    await expect(gitChange).toBeVisible()

    // Stage Git change
    await gitChange.hover()
    await gitChange.getByLabel('Stage Changes').click()

    // Activate the Cody commit message feature
    const generateCommitMessageCta = await page.getByLabel('Generate Commit Message (Cody)')
    expect(generateCommitMessageCta).toBeVisible()
    await generateCommitMessageCta.click()

    const expectedEvents = [
        'CodyVSCodeExtension:command:generateCommitMessage:clicked',
        'CodyVSCodeExtension:command:generateCommitMessage:executed',
    ]
    await assertEvents(mockServer.loggedEvents, expectedEvents)

    // Check generated content is displayed in the source control input
    await expect(
        page.getByLabel('Source Control Input').getByText('hello from the assistant')
    ).toBeVisible()
})

test('commit message generation - cody ignore', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the Source Control view
    await page
        .getByLabel(/Source Control/)
        .nth(2)
        .click()

    // Check the change is showing as a Git change
    const gitChange = page.getByLabel('ignored.js, Untracked')
    await expect(gitChange).toBeVisible()

    // Stage Git change
    await gitChange.hover()
    await gitChange.getByLabel('Stage Changes').click()

    // Activate the Cody commit message feature
    const generateCommitMessageCta = await page.getByLabel('Generate Commit Message (Cody)')
    expect(generateCommitMessageCta).toBeVisible()
    await generateCommitMessageCta.click()

    const expectedEvents = [
        'CodyVSCodeExtension:command:generateCommitMessage:clicked',
        'CodyVSCodeExtension:command:generateCommitMessage:empty',
    ]
    await assertEvents(mockServer.loggedEvents, expectedEvents)

    // Check generated content is not displayed in the source control input
    await expect(
        page.getByLabel('Source Control Input').getByText('hello from the assistant')
    ).not.toBeVisible()
})
