import { type Page, expect } from '@playwright/test'
import * as mockServer from '../fixtures/mock-server'

import {
    focusSidebar,
    getChatEditorPanel,
    getChatInputs,
    getChatSidebarPanel,
    sidebarExplorer,
    sidebarSignin,
} from './common'
import {
    type DotcomUrlOverride,
    type ExpectedV2Events,
    test as baseTest,
    executeCommandInPalette,
} from './helpers'

const test = baseTest.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })

const ERROR_DECORATION_SELECTOR = 'div.view-overlays[role="presentation"] div[class*="squiggly-error"]'

test.extend<ExpectedV2Events>({
    // list of events we expect this test to log, add to this list as needed
    expectedV2Events: [
        'cody.extension:installed',
        'cody.auth.login:firstEver',
        'cody.auth.login.token:clicked',
        'cody.auth:connected',
        'cody.chat-question:submitted',
        'cody.chat-question:executed',
        'cody.chatResponse:noCode',
    ],
})('code action: explain', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the Explorer view from the sidebar
    await sidebarExplorer(page).click()
    // Open the error.ts file from the tree view
    await page.getByRole('treeitem', { name: 'error.ts' }).locator('a').click()
    // Wait for error.ts to fully open
    await page.getByRole('tab', { name: 'error.ts' }).hover()

    // Open the cody sidebar so the chat view is visible
    await focusSidebar(page)

    // Remove the comment that suppresses the type error
    await page.getByText('// @ts-nocheck').click({ clickCount: 3 })
    await page.keyboard.press('Backspace')

    // Activate the code action on the erred text
    const erredText = page.getByText('logNumber').nth(1)
    await page.waitForSelector(ERROR_DECORATION_SELECTOR)
    await erredText.click()
    await erredText.hover()
    await quickFix(page, 'Explain')

    const chatPanel = getChatSidebarPanel(page)
    const input = getChatInputs(chatPanel).first()
    await expect(input).toContainText('Explain the following error:')

    // / Activate the code action different text
    const handlerTxt = page.getByText('hasError').nth(1)
    await handlerTxt.click()
    // No quick fix available for this text, so we execute explain directly
    await executeCommandInPalette(page, 'Cody Command: Explain Code')

    const newChat = getChatInputs(getChatEditorPanel(page)).first()
    await expect(newChat.nth(0)).toContainText('Explain')
})

test.extend<ExpectedV2Events>({
    // list of events we expect this test to log, add to this list as needed
    expectedV2Events: [
        'cody.extension:installed',
        'cody.auth.login:firstEver',
        'cody.auth.login.token:clicked',
        'cody.auth:connected',
        'cody.command.fix:executed',
        'cody.fixup.response:hasCode',
        'cody.fixup.apply:succeeded',
    ],
})('code action: fix', async ({ page, sidebar, nap }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the Explorer view from the sidebar
    await sidebarExplorer(page).click()
    // Open the error.ts file from the tree view
    await page.getByRole('treeitem', { name: 'error.ts' }).locator('a').click()
    // Wait for error.ts to fully open
    await page.getByRole('tab', { name: 'error.ts' }).hover()

    // Remove the comment that suppresses the type error
    await page.getByText('// @ts-nocheck').click({ clickCount: 3 })
    await page.keyboard.press('Backspace')

    // Activate the code action on the erred text
    const erredText = page.getByText('logNumber').nth(1)
    await page.waitForSelector(ERROR_DECORATION_SELECTOR)
    await erredText.click()
    await erredText.hover()
    await quickFix(page, 'Fix')

    const acceptBtn = page.getByRole('button', { name: 'Accept' })
    await expect(acceptBtn).toBeVisible()

    // Accept the fix
    await acceptBtn.click()
    await expect(page.locator(ERROR_DECORATION_SELECTOR)).not.toBeVisible()
})

// executes the explain code action
async function quickFix(page: Page, command: string) {
    await page.getByRole('button', { name: /Quick Fix/ }).click()
    // Get by text takes a very long time, it's faster to type and let the quick fix item be focused
    await page.keyboard.type(command)
    await page.keyboard.press('Enter')
}
