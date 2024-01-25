import { expect } from '@playwright/test'

import { sidebarExplorer, sidebarSignin } from './common'
import { test } from './helpers'

test('unit test commands with context fetching', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the File Explorer view from the sidebar
    await sidebarExplorer(page).click()
    // Open the buzz.ts file from the tree view
    await page.getByRole('treeitem', { name: 'buzz.ts' }).locator('a').dblclick()
    await page.getByRole('tab', { name: 'buzz.ts' }).hover()

    // Bring the cody sidebar to the foreground
    await page.click('.badge[aria-label="Cody"]')

    await page.getByText('Generate unit tests').hover()
    await page.getByText('Generate unit tests').click()

    // Find the chat iframe
    const chatPanelFrame = page.frameLocator('iframe.webview').last().frameLocator('iframe')

    // Click on the chat view then press space to scroll to the bottom of the chat
    await chatPanelFrame
        .getByText('For more tips and tricks, see the Getting Started Guide and docs.')
        .click()
    await page.keyboard.down('Space')

    // Confirm the unit test command is using the relevant test file as context
    await chatPanelFrame.getByText('✨ Context: 29 lines from 2 files').click()

    await expect(chatPanelFrame.locator('span').filter({ hasText: '@buzz.ts:2-14' })).toBeVisible()
    await expect(chatPanelFrame.locator('span').filter({ hasText: '@buzz.test.ts:1-12' })).toBeVisible()

    // Check if assistant responsed
    await expect(chatPanelFrame.getByText('hello from the assistant')).toBeVisible()
})
