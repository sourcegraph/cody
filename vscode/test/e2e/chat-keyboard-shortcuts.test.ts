import { expect } from '@playwright/test'
import * as mockServer from '../fixtures/mock-server'
import {
    chatInputMentions,
    clickEditorTab,
    createEmptyChatPanel,
    getChatInputs,
    getChatSidebarPanel,
    openFileInEditorTab,
    selectLineRangeInEditorTab,
    sidebarSignin,
} from './common'
import { type DotcomUrlOverride, executeCommandInPalette, test } from './helpers'

test.skip('chat keyboard shortcuts for sidebar chat', async ({ page, sidebar }) => {
    await page.bringToFront()
    await sidebarSignin(page, sidebar)

    const chatSidebar = getChatSidebarPanel(page)
    const chatSidebarInput = getChatInputs(chatSidebar).first()

    // Ctrl+Alt+L with no selection opens a new chat in an editor panel (with file mention).
    await openFileInEditorTab(page, 'buzz.ts')
    await clickEditorTab(page, 'buzz.ts')
    await page.keyboard.press('Shift+Control+l')
    await expect(chatSidebarInput).toContainText('buzz.ts', { timeout: 3_000 })

    await executeCommandInPalette(page, 'View: Close Primary Sidebar')

    // Shift+Alt+L with a selection opens a new chat (with selection mention).
    await selectLineRangeInEditorTab(page, 3, 5)
    await page.keyboard.press('Shift+Alt+/')
    await expect(chatSidebarInput).toContainText('buzz.ts:3-5 ')
})

test.skip('re-opening chat adds selection', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)

    await openFileInEditorTab(page, 'buzz.ts')

    const [, lastChatInput] = await createEmptyChatPanel(page)
    await lastChatInput.fill('Hello')
    await lastChatInput.press('Enter')

    await clickEditorTab(page, 'buzz.ts')
    await selectLineRangeInEditorTab(page, 2, 4)
    await page.keyboard.press('Shift+Alt+l')
    await expect(chatInputMentions(lastChatInput)).toHaveText(/^buzz.ts:2-4$/)

    // Re-opening chat does not add duplicate selection
    await openFileInEditorTab(page, 'buzz.ts')
    await selectLineRangeInEditorTab(page, 2, 4)
    await page.keyboard.press('Shift+Alt+l')
    await expect(chatInputMentions(lastChatInput)).toHaveText(/^buzz.ts:2-4$/)
})

test.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })(
    'chat mode keyboard shortcut respects permissions',
    async ({ page, sidebar }) => {
        await sidebarSignin(page, sidebar)
        const chatFrame = getChatSidebarPanel(page)
        const chatInput = getChatInputs(chatFrame).last()

        // Get the initial mode (should be "Chat" by default)
        await chatFrame.getByLabel('switch-mode').click()
        await expect(chatFrame.getByText('ChatSearchEnterprise')).toBeVisible()
        await expect(chatFrame.getByRole('option', { name: 'Search Enterprise' })).toBeDisabled()

        // Escape to close the mode selector
        await page.keyboard.press('Escape')
        await expect(chatFrame.getByRole('option', { name: 'Search Enterprise' })).not.toBeVisible()

        // Try to cycle through modes using keyboard shortcut
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+.' : 'Control+.')

        // Wait a moment for any state changes
        await page.waitForTimeout(500)

        // Check if the mode changed based on user permissions
        // For dotcom users, it should stay as "Chat"
        const modeSelectorButton = chatFrame.getByLabel('switch-mode')
        await expect(modeSelectorButton).toHaveText('Chat')

        // Get the current mode after shortcut
        const newMode = await modeSelectorButton.textContent()

        // Check which options are available and not disabled in the dropdown
        const availableOptions = await page.locator('.tw-command-item:not([disabled])').count()

        // If there are multiple available options, the keyboard shortcut should have changed the mode
        if (availableOptions > 1) {
            // The mode should have changed from the default "Chat"
            expect(newMode).not.toBe('Chat')
        } else {
            // If only one option is available, the mode should still be "Chat"
            expect(newMode).toBe('Chat')
        }

        // Close the dropdown
        await page.keyboard.press('Escape')

        // Try cycling through modes multiple times to ensure we don't get stuck
        for (let i = 0; i < 3; i++) {
            await page.keyboard.press(process.platform === 'darwin' ? 'Meta+.' : 'Control+.')
            await page.waitForTimeout(300)
        }

        // Verify we can still interact with the chat after cycling
        await chatInput.fill('Test message after cycling modes')
        await chatInput.press('Enter')

        // Verify a response is received
        await expect(chatFrame.getByText('hello from the assistant')).toBeVisible()
    }
)
