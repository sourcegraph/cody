import { expect } from '@playwright/test'

import { sidebarSignin } from './common'
import { test } from './helpers'

test('checks if chat history shows up in sidebar and open on click correctly', async ({ page, sidebar }) => {
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

    // Clear and restart chat session
    // All current messages should be removed, and the panel name should be updated to 'New Chat'
    await chatInput.fill('/reset')
    await chatInput.press('Enter')
    await expect(chatPanelFrame.getByText('Hey')).not.toBeVisible()
    await expect(page.getByRole('tab', { name: 'New Chat' })).toBeVisible()

    // Submit a new message and check if both sessions are showing up in the sidebar
    await chatInput.fill('Hola')
    await chatInput.press('Enter')
    await expect(
        page.getByRole('treeitem', { name: 'Hola' }).locator('div').filter({ hasText: 'Hola' }).nth(3)
    ).toBeVisible()
    await expect(
        page.getByRole('treeitem', { name: 'Hey' }).locator('div').filter({ hasText: 'Hey' }).nth(3)
    ).toBeVisible()

    // The panel name is now updated to the last submitted message
    await expect(page.getByRole('tab', { name: 'Hola' })).toBeVisible()

    // Click on the previous chat session to open the chat panel in editor
    // Both chat panels should be visible as tabs in the editor
    await page.getByRole('treeitem', { name: 'Hey' }).locator('div').filter({ hasText: 'Hey' }).nth(3).click()
    await expect(page.getByRole('tab', { name: 'Hola' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Hey' })).toBeVisible()
})
