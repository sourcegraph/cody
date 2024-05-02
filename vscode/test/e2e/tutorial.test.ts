import type { Page } from 'playwright/test'
import * as mockServer from '../fixtures/mock-server'
import { sidebarSignin } from './common'
import {
    type DotcomUrlOverride,
    test as baseTest,
    executeCommandInPalette,
    getMetaKeyByOS,
} from './helpers'
import { acceptInlineCompletion, triggerInlineCompletion } from './utils/completions'
import { triggerFix } from './utils/edit'

const test = baseTest.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })

const triggerEdit = async (page: Page) => {
    await page.keyboard.press('Alt+K')
    await page.waitForTimeout(100)
    await page.keyboard.press('Enter')
}

// TODO: Enable these tests when the interactive tutorial is enabled for all users
test.skip('tutorial should work as expected', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)
    await page.getByRole('treeitem', { name: 'Tutorial' }).locator('a').click()
    // Wait for tutorial to fully open
    await page.getByRole('tab', { name: 'cody_tutorial.py' }).hover()

    await executeCommandInPalette(page, 'View: Zoom Out')
    await executeCommandInPalette(page, 'View: Zoom Out')
    await page.waitForTimeout(100)

    // Autocomplete
    const completionLine = await page.locator('.view-lines > div:nth-child(16)')
    await completionLine.hover()
    await completionLine.click()
    await page.waitForTimeout(100)
    // const completionState = await getTutorialState(page, 'Autocomplete')
    // TODO: Ideally this completion just triggers on click, but our mocking isn't setup for that
    // This works until we support adjusting the mock _per_ test.
    await triggerInlineCompletion(page, 'myFirst')
    await acceptInlineCompletion(page)

    // Edit
    const editLine = await page.locator('.view-lines > div:nth-child(31)')
    await editLine.hover()
    await editLine.click()
    await triggerEdit(page)

    // Fix
    const fixRange = await page.getByText('"List of fruits:"')
    await triggerFix(page, fixRange)

    // Chat
    await page.getByText('Start a Chat', { exact: true }).click({
        modifiers: [getMetaKeyByOS()],
    })
    await page.getByLabel('New Chat, Editor Group 2')
})
