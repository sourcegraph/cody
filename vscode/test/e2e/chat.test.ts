import { expect, Frame, FrameLocator, Page } from '@playwright/test'

import * as mockServer from '../fixtures/mock-server'

import { disableNotifications, sidebarSignin } from './common'
import { test } from './helpers'

test('shows upgrade rate limit message for free users', async ({ page, sidebar }) => {
    await fetch(`${mockServer.SERVER_URL}/.test/completions/triggerRateLimit/free`, {
        method: 'POST',
    })

    const chatFrame = await prepareChat(page, sidebar)
    await sendChatMessage(page)
    await expectUpgradeRateLimitMessage(chatFrame)
})

test('shows standard rate limit message for pro users', async ({ page, sidebar }) => {
    await fetch(`${mockServer.SERVER_URL}/.test/completions/triggerRateLimit/pro`, {
        method: 'POST',
    })

    const chatFrame = await prepareChat(page, sidebar)
    await sendChatMessage(page)
    await expectStandardRateLimitMessage(chatFrame)
})

test('shows standard rate limit message for non-dotCom users', async ({ page, sidebar }) => {
    await fetch(`${mockServer.SERVER_URL}/.test/completions/triggerRateLimit`, {
        method: 'POST',
    })

    const chatFrame = await prepareChat(page, sidebar)
    await sendChatMessage(page)
    await expectStandardRateLimitMessage(chatFrame)
})

/**
 * Sets up a chat window ready for testing.
 */
async function prepareChat(page: Page, sidebar: Frame): Promise<FrameLocator> {
    // Turn off notifications because they can obscure the chat box
    await disableNotifications(page)

    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Enable new chat UI
    await page.getByRole('button', { name: 'cody-logo-heavy, Cody Settings' }).click()
    await page
        .getByRole('option', { name: 'New Chat UI, Experimental, Enable new chat panel UI' })
        .locator('span')
        .filter({ hasText: 'Experimental' })
        .first()
        .click()

    // Bring the cody sidebar to the foreground if it's not already there
    if (!(await page.isVisible('[aria-label="Chat History"]'))) {
        await page.click('[aria-label="Cody"]')
    }

    // Open the new chat panel
    await page.getByRole('button', { name: 'New Chat', exact: true }).click()

    // Find the chat iframe inside the editor iframe
    const chatFrameLocator = page.frameLocator('iframe.webview').frameLocator('iframe')

    // Put focus in the chat textbox
    await chatFrameLocator.getByRole('textbox', { name: 'Chat message' }).click()

    return chatFrameLocator
}

async function sendChatMessage(page: Page): Promise<void> {
    await page.keyboard.type('Hello')
    await page.keyboard.press('Enter')
}

async function expectStandardRateLimitMessage(chatFrame: FrameLocator): Promise<void> {
    // Standard error
    await expect(chatFrame.getByText('Unable to Send Message')).toBeVisible()
    await expect(chatFrame.getByRole('button', { name: 'Learn More' })).toBeVisible()
    // No upgrade options
    await expect(chatFrame.getByText('UPGRADE TO CODY PRO')).not.toBeVisible()
    await expect(chatFrame.getByRole('button', { name: 'Upgrade' })).not.toBeVisible()
}

async function expectUpgradeRateLimitMessage(chatFrame: FrameLocator): Promise<void> {
    // Upgrade options
    await expect(chatFrame.getByText('UPGRADE TO CODY PRO')).toBeVisible()
    await expect(chatFrame.getByRole('button', { name: 'Upgrade' })).toBeVisible()
    await expect(chatFrame.getByRole('button', { name: 'Learn More' })).toBeVisible()
    // No standard error
    await expect(chatFrame.getByText('Unable to Send Message')).not.toBeVisible()
}
