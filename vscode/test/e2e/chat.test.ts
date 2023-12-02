import { expect, Frame, FrameLocator, Page } from '@playwright/test'

import * as mockServer from '../fixtures/mock-server'

import { disableNotifications, sidebarSignin } from './common'
import { test } from './helpers'

test('shows appropriate rate limit message for free users', async ({ page, sidebar }) => {
    const chatFrame = await prepareChat(page, sidebar)

    await fetch(`${mockServer.SERVER_URL}/.test/completions/triggerRateLimit/free`, {
        method: 'POST',
    })

    await page.keyboard.type('Hello')
    await page.keyboard.press('Enter')

    await expect(chatFrame.getByText('UPGRADE TO CODY PRO')).toBeVisible()
    await expect(chatFrame.getByText('Unable to Send Message')).not.toBeVisible()
    await expect(chatFrame.getByRole('button', { name: 'Upgrade' })).toBeVisible()
    await expect(chatFrame.getByRole('button', { name: 'Learn More' })).toBeVisible()
})

test('shows appropriate rate limit message for pro users', async ({ page, sidebar }) => {
    const chatFrame = await prepareChat(page, sidebar)

    await fetch(`${mockServer.SERVER_URL}/.test/completions/triggerRateLimit/pro`, {
        method: 'POST',
    })

    await page.keyboard.type('Hello')
    await page.keyboard.press('Enter')

    await expect(chatFrame.getByText('UPGRADE TO CODY PRO')).not.toBeVisible()
    await expect(chatFrame.getByText('Unable to Send Message')).toBeVisible()
    await expect(chatFrame.getByRole('button', { name: 'Upgrade' })).not.toBeVisible()
    await expect(chatFrame.getByRole('button', { name: 'Learn More' })).toBeVisible()
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

    const chatFrameLocator = page.frameLocator('iframe.webview').frameLocator('iframe')

    await chatFrameLocator.getByRole('textbox', { name: 'Chat message' }).click()

    return chatFrameLocator
}
