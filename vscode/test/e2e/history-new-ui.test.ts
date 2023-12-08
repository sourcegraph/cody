import { expect } from '@playwright/test'

import { sidebarSignin } from './common'
import { test } from './helpers'

test('checks if chat history shows up in sidebar', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    await page.getByRole('button', { name: 'New Chat', exact: true }).click()

    const chatPanelFrame = page.frameLocator('iframe.webview').last().frameLocator('iframe')

    const chatInput = chatPanelFrame.getByRole('textbox', { name: 'Chat message' })
    await chatInput.fill('Hey')
    await chatInput.press('Enter')

    // Check if chat shows up in sidebar chat history tree view
    await expect(
        page.getByRole('treeitem', { name: 'Hey' }).locator('div').filter({ hasText: 'Hey' }).nth(3)
    ).toBeVisible()
})
