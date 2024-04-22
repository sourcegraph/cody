import { type Page } from 'playwright/test'
import * as mockServer from '../fixtures/mock-server'
import { sidebarSignin } from './common'
import {
    type DotcomUrlOverride,
    executeCommandInPalette,
    getMetaKeyByOS,
    test as baseTest,
} from './helpers'
import { acceptInlineCompletion, triggerInlineCompletion } from './utils/completions'
import { triggerFix } from './utils/edit'

const test = baseTest.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })

const triggerEdit = async (page: Page) => {
    await page.keyboard.press('Alt+K')
    await page.waitForTimeout(100)
    await page.keyboard.press('Enter')
}

test('tutorial should work as expected', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)
    await page.getByRole('treeitem', { name: 'Tutorial' }).locator('a').click()
    // Wait for tutorial to fully open
    await page.getByRole('tab', { name: 'cody_tutorial.py' }).hover()

    // Note
    await executeCommandInPalette(page, 'View: Zoom Out')
    await executeCommandInPalette(page, 'View: Zoom Out')
    await page.waitForTimeout(100)

    // START AUTOCOMPLETE TUTORIAL
    const completionLine = await page.locator('.view-lines > div:nth-child(16)')
    await completionLine.hover()
    await completionLine.click()
    await page.waitForTimeout(100)
    // const completionState = await getTutorialState(page, 'Autocomplete')
    // TODO: Ideally this completion just triggers on click, but our mocking isn't setup for that
    // This works until we support adjusting the mock _per_ test.
    await triggerInlineCompletion(page, 'myFirst')
    await acceptInlineCompletion(page)
    // Confirm that the 👉 has changed to a ✅
    // const newCompletionState = await getTutorialState(page, 'Autocomplete')
    // expect(newCompletionState).not.toBe(completionState)
    // END AUTOCOMPLETE TUTORIAL

    // START EDIT TUTORIAL
    const editLine = await page.locator('.view-lines > div:nth-child(31)')
    await editLine.hover()
    await editLine.click()
    // const editState = await getTutorialState(page, 'Edit')
    await triggerEdit(page)
    // Confirm that the 👉 has changed to a ✅
    // const newEditState = await getTutorialState(page, 'Edit')
    // expect(newEditState).not.toBe(editState)
    // END EDIT TUTORIAL

    // START FIX TUTORIAL
    const fixRange = await page.getByText('"List of fruits:"')
    // const fixState = await getTutorialState(page, 'Fix')
    await triggerFix(page, fixRange)
    // Confirm that the 👉 has changed to a ✅
    // const newFixState = await getTutorialState(page, 'Fix')
    // expect(newFixState).not.toBe(fixState)
    // END FIX TUTORIAL

    // CHAT TUTORIAL
    // const chatState = await getTutorialState(page, 'Chat')
    await page.getByText('Start a Chat', { exact: true }).click({
        modifiers: [getMetaKeyByOS()],
    })
    await page.getByLabel('New Chat, Editor Group 2')
    // Confirm that the 👉 has changed to a ✅
    // const newChatState = await getTutorialState(page, 'Chat')
    // expect(newChatState).not.toBe(chatState)
    // END CHAT TUTORIAL
})
