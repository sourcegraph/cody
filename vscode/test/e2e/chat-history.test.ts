import { expect } from '@playwright/test'

import { sidebarSignin } from './common'
import { test } from './helpers'

test('shows chat history in sidebar and update chat panel correctly', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    const heyTreeItem = page.getByRole('treeitem', { name: 'Hey' })
    const holaTreeItem = page.getByRole('treeitem', { name: 'Hola' })

    await page.getByRole('button', { name: 'New Chat', exact: true }).click()

    const chatPanelFrame = page.frameLocator('iframe.webview').last().frameLocator('iframe')

    const chatInput = chatPanelFrame.getByRole('textbox', { name: 'Chat message' })
    await chatInput.fill('Hey')
    await chatInput.press('Enter')

    // Check if chat shows up in sidebar chat history tree view
    await expect(heyTreeItem).toBeVisible()

    // Clear and restart chat session
    // All current messages should be removed, and the panel name should be updated to 'New Chat'
    await chatInput.fill('/reset')
    await chatInput.press('Enter')
    await expect(chatPanelFrame.getByText('Hey')).not.toBeVisible()
    await expect(page.getByRole('tab', { name: 'New Chat' })).toBeVisible()

    // Submit a new message and check if both sessions are showing up in the sidebar
    await chatInput.fill('Hola')
    await chatInput.press('Enter')
    await expect(holaTreeItem).toBeVisible()
    await expect(heyTreeItem).toBeVisible()

    // The panel name is now updated to the last submitted message
    await expect(page.getByRole('tab', { name: 'Hola' })).toBeVisible()

    // Click on the previous chat session to open the chat panel in editor
    // Both chat panels should be visible as tabs in the editor
    await page
        .getByRole('treeitem', { name: 'Hey' })
        .locator('div')
        .filter({ hasText: 'Hey' })
        .nth(3)
        .click()
    await expect(page.getByRole('tab', { name: 'Hola' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Hey' })).toBeVisible()

    // Chat buttons may only appear when we're hovering a chat.
    await heyTreeItem.hover()
    await heyTreeItem.getByLabel('Delete Chat').click()
    await holaTreeItem.hover()
    await holaTreeItem.getByLabel('Delete Chat').click()

    expect(heyTreeItem).not.toBeVisible()
    expect(holaTreeItem).not.toBeVisible()

    // Once the chat history is empty, the 'New Chat' button should show up
    await expect(page.getByRole('button', { name: 'New Chat', exact: true })).toBeVisible()
})
