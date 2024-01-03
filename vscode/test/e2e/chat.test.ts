import { expect, Frame, FrameLocator, Locator, Page } from '@playwright/test'

import * as mockServer from '../fixtures/mock-server'

import { sidebarSignin } from './common'
import { test as baseTest, DotcomUrlOverride } from './helpers'

const test = baseTest.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })

test('shows upgrade rate limit message for free users', async ({ page, sidebar }) => {
    await fetch(`${mockServer.SERVER_URL}/.test/completions/triggerRateLimit/free`, {
        method: 'POST',
    })

    const [chatFrame, chatInput] = await prepareChat(page, sidebar)
    await chatInput.fill('test message')
    await chatInput.press('Enter')

    await expect(chatFrame.getByRole('heading', { name: 'Upgrade to Cody Pro' })).toBeVisible()
    await expect(chatFrame.getByRole('button', { name: 'Upgrade' })).toBeVisible()
})

test('shows standard rate limit message for pro users', async ({ page, sidebar }) => {
    await fetch(`${mockServer.SERVER_URL}/.test/completions/triggerRateLimit/pro`, {
        method: 'POST',
    })

    const [chatFrame, chatInput] = await prepareChat(page, sidebar)
    await chatInput.fill('test message')
    await chatInput.press('Enter')

    await expect(chatFrame.getByRole('heading', { name: 'Unable to Send Message' })).toBeVisible()
    await expect(chatFrame.getByRole('button', { name: 'Learn More' })).toBeVisible()
})

test('shows standard rate limit message for non-dotCom users', async ({ page, sidebar }) => {
    await fetch(`${mockServer.SERVER_URL}/.test/completions/triggerRateLimit`, {
        method: 'POST',
    })

    const [chatFrame, chatInput] = await prepareChat(page, sidebar)
    await chatInput.fill('test message')
    await chatInput.press('Enter')

    await expect(chatFrame.getByRole('heading', { name: 'Unable to Send Message' })).toBeVisible()
    await expect(chatFrame.getByRole('button', { name: 'Learn More' })).toBeVisible()
})

export async function prepareChat(page: Page, sidebar: Frame): Promise<[FrameLocator, Locator]> {
    await sidebarSignin(page, sidebar)
    await page.getByRole('button', { name: 'New Chat', exact: true }).click()
    // Chat webview iframe is the second and last frame (search is the first)
    const chatFrame = page.frameLocator('iframe.webview').last().frameLocator('iframe')
    const chatInput = chatFrame.getByRole('textbox', { name: 'Chat message' })
    return [chatFrame, chatInput]
}
