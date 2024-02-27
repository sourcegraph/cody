import * as mockServer from '../fixtures/mock-server'

import { sidebarExplorer, sidebarSignin } from './common'
import { type DotcomUrlOverride, type ExpectedEvents, test as baseTest } from './helpers'

const test = baseTest.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })

const ERROR_DECORATION_SELECTOR = 'div.view-overlays[role="presentation"] div[class*="squiggly-error"]'

test.extend<ExpectedEvents>({
    // list of events we expect this test to log, add to this list as needed
    expectedEvents: [
        'CodyVSCodeExtension:chat-question:submitted',
        'CodyVSCodeExtension:chat-question:executed',
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

    // Remove the comment that suppresses the type error
    await page.getByText('// @ts-nocheck').click({ clickCount: 3 })
    await page.keyboard.press('Backspace')

    // Activate the code action on the erred text
    const erredText = page.getByText('logNumber').nth(1)
    await page.waitForSelector(ERROR_DECORATION_SELECTOR)
    await erredText.click()
    await erredText.hover()
    await page.getByRole('button', { name: /Quick Fix/ }).click()
    // Get by text takes a very long time, it's faster to type and let the quick fix item be focused
    await page.keyboard.type('Explain')
    await page.keyboard.press('Enter')
})

test.extend<ExpectedEvents>({
    // list of events we expect this test to log, add to this list as needed
    expectedEvents: [
        'CodyVSCodeExtension:command:edit:executed',
        'CodyVSCodeExtension:fixupResponse:hasCode',
        'CodyVSCodeExtension:fixup:applied',
    ],
})('code action: fix', async ({ page, sidebar }) => {
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
    await page.getByRole('button', { name: /Quick Fix/ }).click()
    // Get by text takes a very long time, it's faster to type and let the quick fix item be focused
    await page.keyboard.type('Fix')
    await page.keyboard.press('Enter')
})
