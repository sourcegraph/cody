import { expect } from '@playwright/test'
import * as mockServer from '../fixtures/mock-server'

import { sidebarSignin } from './common'
import {
    type DotcomUrlOverride,
    type ExtraWorkspaceSettings,
    test as baseTest,
    executeCommandInPalette,
} from './helpers'
import { testGitWorkspace } from './utils/gitWorkspace'

const test = baseTest.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })

test.beforeEach(() => {
    mockServer.resetLoggedEvents()
})

testGitWorkspace.extend<ExtraWorkspaceSettings>({
    extraWorkspaceSettings: {
        'cody.internal.unstable': true, // Needed for Cody Ignore
        'cody.experimental.commitMessage': true,
    },
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
    await executeCommandInPalette(page, 'Generate Commit Message (Experimental)')

    const scmInputBox = page.getByLabel('Source Control Input')
    await expect(scmInputBox.filter({ hasText: 'hello from the assistant' }).first()).toBeVisible()

    // Ensure that no notification is shown
    await expect(page.getByLabel('Cody was forced to skip').first()).not.toBeVisible({
        timeout: 1000,
    })

    // Ensure that no additional files have been staged
    await expect(
        page
            .getByLabel('Staged Changes', { exact: true })
            .locator('div')
            .filter({ hasText: '1' })
            .first()
    ).toBeVisible()

    // Commit the change so we empty the input box
    page.getByRole('button', { name: 'Commit' })

    // await page.getByRole('heading', { name: 'Source Control' }).hover()
    await page.getByText('Changes3').click()
    await page.getByText('Changes3').getByLabel('Stage All Changes').click()

    await page.getByRole('button', { name: 'Generate Commit Message (Experimental)' }).click()

    await expect(scmInputBox.filter({ hasText: 'hello from the assistant' }).first()).toBeVisible()

    // Verify notification is shown if items are ignored
    await expect(page.getByLabel('Cody was forced to skip 1 file').first()).toBeVisible()
})
