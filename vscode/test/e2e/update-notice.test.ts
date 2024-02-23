import { expect } from '@playwright/test'

import { sidebarSignin } from './common'
import { test } from './helpers'

const versionUpdateStorageKey = 'notices.last-dismissed-version'
const greetingChatText = 'Welcome to Cody!'
const updateToastText = /Cody updated to v\d+\.\d+/

test('new installs should not show the update toast', async ({ page, sidebar }) => {
    // Sign in and start a chat
    await sidebarSignin(page, sidebar)
    await page.getByRole('button', { name: 'New Chat', exact: true }).click()
    const chatFrame = page.frameLocator('iframe.webview').last().frameLocator('iframe')

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
    await page.getByRole('button', { name: 'New Chat', exact: true }).click()
    let chatFrame = page.frameLocator('iframe.webview').last().frameLocator('iframe')
    const chatInput = chatFrame.getByRole('textbox', { name: 'Chat message' })
    await chatInput.fill('hey buddy')
    await chatInput.press('Enter')

    // Forge an older dismissed version into local storage.
    expect(
        await chatFrame.locator(':root').evaluate((_, versionUpdateStorageKey) => {
            localStorage.setItem(versionUpdateStorageKey, '0.7')
            return localStorage.getItem(versionUpdateStorageKey)
        }, versionUpdateStorageKey)
    ).toBe('0.7')

    // Wait for this chat to be available in the sidebar
    const chatHistoryEntry = page.getByRole('treeitem', { name: 'hey buddy' })
    await expect(chatHistoryEntry).toBeVisible()
    await page.locator('*[aria-label="Tab actions"] *[aria-label~="Close"]').click()

    // Reopen the chat; the update notice should be visible.
    await chatHistoryEntry.click()
    chatFrame = page.frameLocator('iframe.webview').last().frameLocator('iframe')
    const introChat = chatFrame.getByText(greetingChatText)
    await expect(introChat).toBeVisible()
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
