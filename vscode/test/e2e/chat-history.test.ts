import { expect } from '@playwright/test'

import { createEmptyChatPanel, sidebarSignin } from './common'
import { type ExpectedEvents, test } from './helpers'

test.extend<ExpectedEvents>({
    // list of events we expect this test to log, add to this list as needed
    expectedEvents: [
        'CodyInstalled',
        'CodyVSCodeExtension:auth:clickOtherSignInOptions',
        'CodyVSCodeExtension:login:clicked',
        'CodyVSCodeExtension:auth:selectSigninMenu',
        'CodyVSCodeExtension:auth:fromToken',
        'CodyVSCodeExtension:Auth:connected',
        'CodyVSCodeExtension:chat-question:submitted',
        'CodyVSCodeExtension:chat-question:executed',
        'CodyVSCodeExtension:chat-question:submitted',
        'CodyVSCodeExtension:chat-question:executed',
        'CodyVSCodeExtension:Auth:connected',
    ],
    expectedV2Events: [
        // 'cody.extension:installed', // ToDo: Uncomment once this bug is resolved: https://github.com/sourcegraph/cody/issues/3825
        'cody.extension:savedLogin',
        'cody.codyIgnore:hasFile',
        'cody.auth:failed',
        'cody.auth.login:clicked',
        'cody.auth.signin.menu:clicked',
        'cody.auth.login:firstEver',
        'cody.auth.signin.token:clicked',
        'cody.auth:connected',
        'cody.chat-question:submitted',
        'cody.chat-question:executed',
        'cody.chatResponse:noCode',
    ],
})('shows chat history in sidebar and update chat panel correctly', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    const heyTreeItem = page.getByRole('treeitem', { name: 'Hey' })
    const holaTreeItem = page.getByRole('treeitem', { name: 'Hola' })

    const [chatPanelFrame, chatInput] = await createEmptyChatPanel(page)

    await chatInput.fill('Hey')
    await chatInput.press('Enter')

    // Check if chat shows up in sidebar chat history tree view
    await expect(heyTreeItem).toBeVisible()

    // Wait at least 1 second to ensure that the 2 chats have different IDs (which are currently
    // created using `new Date(Date.now()).toUTCString()`, so they are the same if they are
    // generated in the same second).
    //
    // TODO(sqs): investigate and fix the underlying bug here
    await page.waitForTimeout(1000)

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
    await expect(page.getByRole('tab', { name: 'Hey' })).toBeVisible()

    // NOTE: Action buttons may only appear when we're hovering a chat.
    // Deleting a chat should also close its associated chat panel
    await heyTreeItem.hover()
    await heyTreeItem.getByLabel('Delete Chat').hover()
    await heyTreeItem.getByLabel('Delete Chat').click()
    await page.waitForTimeout(100)
    expect(heyTreeItem).not.toBeVisible()
    await expect(page.getByRole('tab', { name: 'Hey' })).not.toBeVisible()

    await holaTreeItem.hover()
    await holaTreeItem.getByLabel('Delete Chat').hover()
    await holaTreeItem.getByLabel('Delete Chat').click()
    await page.waitForTimeout(100)
    expect(holaTreeItem).not.toBeVisible()
    await expect(page.getByRole('tab', { name: 'Hola' })).not.toBeVisible()

    // Once the chat history is empty, the 'New Chat' button should show up
    await page.waitForSelector('div[class*="welcome-view-content"]')
    await page.locator('.welcome-view-content').hover()
    await page.getByRole('button', { name: 'New Chat', exact: true }).hover()
    await expect(page.getByRole('button', { name: 'New Chat', exact: true })).toBeVisible()
})
