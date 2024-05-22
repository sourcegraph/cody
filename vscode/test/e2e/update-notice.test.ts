import { expect } from '@playwright/test'

import { createEmptyChatPanel, sidebarSignin } from './common'
import { test } from './helpers'

const versionUpdateStorageKey = 'notices.last-dismissed-version'
const greetingChatText = 'Welcome to Cody!'
const updateToastText = /Cody updated to v\d+\.\d+/

test('new installs should not show the update toast', async ({ page, sidebar }) => {
    // Sign in and start a chat
    await sidebarSignin(page, sidebar)
    const [chatFrame] = await createEmptyChatPanel(page)

    // The "updated" toast should not appear
    const introChat = chatFrame.getByText(greetingChatText)
    await expect(introChat).toBeVisible()
    const chatNotice = chatFrame.getByText(updateToastText)
    await expect(chatNotice).not.toBeVisible()

    // Local storage should reflect the extension version, for future update
    // notices
    expect(
        await chatFrame.locator(':root').evaluate((_, versionUpdateStorageKey) => {
            return localStorage.getItem(versionUpdateStorageKey)
        }, versionUpdateStorageKey)
    ).toMatch(/\d+\.\d+/)
})

test('existing installs should show the update toast when the last dismissed version is different', async ({
    page,
    sidebar,
}) => {
    // Sign in
    await sidebarSignin(page, sidebar)

    // Use chat.
    let [chatFrame, chatInput] = await createEmptyChatPanel(page)

    // Submit a chat message
    await chatInput.fill('hey buddy')
    await chatInput.press('Enter')
    await expect(chatFrame.getByText('hey buddy')).toBeVisible()

    // Forge an older dismissed version into local storage.
    expect(
        await chatFrame.locator(':root').evaluate((_, versionUpdateStorageKey) => {
            localStorage.setItem(versionUpdateStorageKey, '0.7')
            return localStorage.getItem(versionUpdateStorageKey)
        }, versionUpdateStorageKey)
    ).toBe('0.7')

    await page.getByLabel(/Close /).click()
    await expect(chatFrame.getByText('hey buddy')).not.toBeVisible()

    // Wait for this chat to be available in the sidebar
    const chatHistoryEntry = page.getByRole('treeitem', { name: 'hey buddy' })
    await expect(chatHistoryEntry).toBeVisible()

    // Reopen the chat; the update notice should be visible.
    // Welcome message is removed.
    await chatHistoryEntry.click()
    chatFrame = page.frameLocator('iframe.webview').last().frameLocator('iframe')
    const introChat = chatFrame.getByText(greetingChatText)
    await expect(introChat).not.toBeVisible()
    const chatNotice = chatFrame.getByText(updateToastText)
    await expect(chatNotice).toBeVisible()

    // Dismiss the notice, expect local storage to have been updated
    await chatFrame.locator('.codicon.codicon-close').click()
    expect(
        await chatFrame.locator(':root').evaluate((_, versionUpdateStorageKey) => {
            return localStorage.getItem(versionUpdateStorageKey)
        }, versionUpdateStorageKey)
    ).not.toBe('0.7')
})
