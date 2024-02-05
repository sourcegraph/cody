import { expect } from '@playwright/test'

import { sidebarSignin } from './common'
import { test, assertEvents, type ExpectedEvents } from './helpers'
import { resetLoggedEvents, loggedEvents } from '../fixtures/mock-server'

test.beforeEach(() => {
    void resetLoggedEvents()
})

test.extend<ExpectedEvents>({
    // list of events we expect this test to log, add to this list as needed
    expectedEvents: [
        'CodyVSCodeExtension:auth:clickOtherSignInOptions',
        'CodyVSCodeExtension:login:clicked',
        'CodyVSCodeExtension:auth:selectSigninMenu',
        'CodyVSCodeExtension:auth:fromToken',
        'CodyVSCodeExtension:Auth:connected',
        'CodyVSCodeExtension:chat-question:executed',
        'CodyVSCodeExtension:chat-question:executed',
        'CodyVSCodeExtension:Auth:connected',
    ],
})(
    'shows chat history in sidebar and update chat panel correctly',
    async ({ page, sidebar, expectedEvents }) => {
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
            page
                .getByRole('treeitem', { name: 'Hola' })
                .locator('div')
                .filter({ hasText: 'Hola' })
                .nth(3)
        ).toBeVisible()
        await expect(
            page.getByRole('treeitem', { name: 'Hey' }).locator('div').filter({ hasText: 'Hey' }).nth(3)
        ).toBeVisible()

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

        // Click the delete chat button twice to remove the chats we submitted
        // Check for counts to ensure we wait for the delete to be completed before
        // trying to click again, or we might quickly click the last one twice
        await expect(page.getByLabel('Delete Chat')).toHaveCount(2)
        await page.getByLabel('Delete Chat').last().click()
        await expect(page.getByLabel('Delete Chat')).toHaveCount(1)
        await page.getByLabel('Delete Chat').last().click()

        // Once the chat history is empty, the 'New Chat' button should show up
        await expect(page.getByRole('button', { name: 'New Chat', exact: true })).toBeVisible()

        // Critical test to prevent event logging regressions.
        // Do not remove without consulting data analytics team.
        await assertEvents(loggedEvents, expectedEvents)
    }
)
