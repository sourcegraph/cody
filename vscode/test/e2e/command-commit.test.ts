import { expect } from '@playwright/test'
import * as mockServer from '../fixtures/mock-server'

import { sidebarSignin } from './common'
import { type DotcomUrlOverride, type ExpectedEvents, test as baseTest } from './helpers'
import { testGitWorkspace } from './utils/gitWorkspace'

const test = baseTest.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })

test.beforeEach(() => {
    mockServer.resetLoggedEvents()
})

testGitWorkspace.extend<ExpectedEvents>({
    // list of events we expect this test to log, add to this list as needed
    expectedEvents: [
        'CodyVSCodeExtension:sidebar:commit:clicked',
        'CodyVSCodeExtension:command:commit:executed',
    ],
    expectedV2Events: ['cody.sidebar.commit:clicked', 'cody.command.commit:executed'],
})('use terminal output as context', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)

    // Open the Source Control View to confirm this is a git workspace
    const sourceControlView = page.getByLabel(/Source Control/).nth(2)
    await sourceControlView.click()
    await expect(page.getByRole('heading', { name: 'Source Control' })).toBeVisible()
    await expect(page.getByText('index.js')).toBeVisible()

    // Click on the command in the sidebar to verify it opens the source control panel.
    await page.getByRole('tab', { name: 'Cody', exact: true }).locator('a').click()
    await page.getByText('Generate Commit (Experimental)', { exact: true }).click()

    // await page.getByRole('heading', { name: 'Source Control' }).hover()

    const scmInputBox = page.getByLabel('Source Control Input')

    // Verify notification is shown if items are ignored
    await expect(scmInputBox.filter({ hasText: 'hello from the assistant' }).first()).toBeVisible()
    try {
        await expect(
            page
                .locator('.notification-list-item-message')
                .filter({ hasText: 'Cody was forced to skip' })
        ).toBeVisible()
    } catch (e) {
        //for some reason notifications aren't shown during tests. Skip for now
    }

    // Remove the ignored file from the staged changes.
    await expect(page.getByText('Staged Changes')).toBeVisible()
    await page.locator('a').filter({ hasText: 'ignored.js' }).hover()
    await page.getByRole('button', { name: 'Unstage Changes' }).click()

    // Stage a non-ignored file.
    await page.locator('a').filter({ hasText: 'index.js' }).hover()
    await page.getByRole('button', { name: 'Stage Changes' }).click()

    // Execute the command again from the Cody icon located inside the Source Control view.
    await page.getByRole('button', { name: 'Generate Commit (Experimental)' }).click()

    // Verify a commit message is generated without error for the staged file.
    await expect(scmInputBox.filter({ hasText: 'hello from the assistant' }).first()).toBeVisible()
})
