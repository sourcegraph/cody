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
    expectedEvents: ['CodyVSCodeExtension:sidebar:commit:clicked'],
    expectedV2Events: ['cody.sidebar.commit:clicked'],
})('use terminal output as context', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)

    // Open the Source Control View to confirm this is a git workspace
    const sourceControlView = page.getByLabel(/Source Control/).nth(2)
    await sourceControlView.click()
    await expect(page.getByRole('heading', { name: 'Source Control' })).toBeVisible()
    await expect(page.getByText('index.js')).toBeVisible()

    // Disable do-not-disturb
    await page.getByRole('button', { name: 'Do Not Disturb' }).click()

    // We start by only staging the index.js file
    await page.getByLabel('index.js • Modified').locator('div').filter({ hasText: 'index.js' }).click()
    await page.getByRole('button', { name: 'Stage Changes' }).click()

    // Click on the command in the sidebar to verify it opens the source control panel.
    await page.getByRole('tab', { name: 'Cody', exact: true }).locator('a').click()
    await page.getByText('Generate Commit Message (Experimental)', { exact: true }).click()

    const scmInputBox = page.getByLabel('Source Control Input')
    await expect(scmInputBox.filter({ hasText: 'hello from the assistant' }).first()).toBeVisible()

    //we reset the text in the commit box
    scmInputBox
        .getByLabel(
            'The editor is not accessible at this time. To enable screen reader optimized mode, use Shift+Option+F1'
        )
        .fill('')

    // Ensure that no notification is shown
    await expect(page.getByLabel('Cody was forced to skip').first()).not.toBeVisible({ timeout: 1000 })

    // Ensure that no additional files have been staged
    await expect(
        page
            .getByLabel('Staged Changes', { exact: true })
            .locator('div')
            .filter({ hasText: '1' })
            .first()
    ).toBeVisible()

    // await page.getByRole('heading', { name: 'Source Control' }).hover()
    await page.getByText('Staged Changes').click()
    await page.getByLabel('Unstage All Changes').click()
    await page.getByText('Changes4').click()
    await page.getByLabel('Stage All Changes').click()

    await page.getByRole('button', { name: 'Generate Commit Message (Experimental)' }).click()

    await expect(scmInputBox.filter({ hasText: 'hello from the assistant' }).first()).toBeVisible()

    // Verify notification is shown if items are ignored
    await expect(page.getByLabel('Cody was forced to skip 1 file').first()).toBeVisible()
})
