import { expect, type Frame, type FrameLocator, type Locator, type Page } from '@playwright/test'

import * as mockServer from '../fixtures/mock-server'

import { sidebarSignin } from './common'
import { assertEvents, test as baseTest, type DotcomUrlOverride, type ExpectedEvents } from './helpers'

const test = baseTest.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })

test.beforeEach(() => {
    void mockServer.resetLoggedEvents()
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
    ],
})('shows upgrade rate limit message for free users', async ({ page, sidebar, expectedEvents }) => {
    await fetch(`${mockServer.SERVER_URL}/.test/completions/triggerRateLimit/free`, {
        method: 'POST',
    })

    const [chatFrame, chatInput] = await prepareChat(page, sidebar)
    await chatInput.fill('test message')
    await chatInput.press('Enter')

    await expect(chatFrame.getByRole('heading', { name: 'Upgrade to Cody Pro' })).toBeVisible()
    await expect(chatFrame.getByRole('button', { name: 'Upgrade' })).toBeVisible()

    // prevents regresssions in events we are logging; do not remove this test
    expectedEvents.push('CodyVSCodeExtension:upsellUsageLimitCTA:shown')
    await assertEvents(mockServer.loggedEvents, expectedEvents)
    expectedEvents.pop()
})

test('shows standard rate limit message for pro users', async ({ page, sidebar, expectedEvents }) => {
    await fetch(`${mockServer.SERVER_URL}/.test/completions/triggerRateLimit/pro`, {
        method: 'POST',
    })

    const [chatFrame, chatInput] = await prepareChat(page, sidebar)
    await chatInput.fill('test message')
    await chatInput.press('Enter')

    await expect(chatFrame.getByRole('heading', { name: 'Unable to Send Message' })).toBeVisible()
    await expect(chatFrame.getByRole('button', { name: 'Learn More' })).toBeVisible()

    // Critical test to prevent event logging regressions.
    // Do not remove without consulting data analytics team.
    expectedEvents.push('CodyVSCodeExtension:abuseUsageLimitCTA:shown')
    await assertEvents(mockServer.loggedEvents, expectedEvents)
    expectedEvents.pop()
})

test('shows standard rate limit message for non-dotCom users', async ({
    page,
    sidebar,
    expectedEvents,
}) => {
    await fetch(`${mockServer.SERVER_URL}/.test/completions/triggerRateLimit`, {
        method: 'POST',
    })

    const [chatFrame, chatInput] = await prepareChat(page, sidebar)
    await chatInput.fill('test message')
    await chatInput.press('Enter')

    await expect(chatFrame.getByRole('heading', { name: 'Unable to Send Message' })).toBeVisible()
    await expect(chatFrame.getByRole('button', { name: 'Learn More' })).toBeVisible()

    // Critical test to prevent event logging regressions.
    // Do not remove without consulting data analytics team.
    expectedEvents.push('CodyVSCodeExtension:abuseUsageLimitCTA:shown')
    await assertEvents(mockServer.loggedEvents, expectedEvents)
    expectedEvents.pop()
})

export async function prepareChat(page: Page, sidebar: Frame): Promise<[FrameLocator, Locator]> {
    await sidebarSignin(page, sidebar)
    await page.getByRole('button', { name: 'New Chat', exact: true }).click()
    // Chat webview iframe is the second and last frame (search is the first)
    const chatFrame = page.frameLocator('iframe.webview').last().frameLocator('iframe')
    const chatInput = chatFrame.getByRole('textbox', { name: 'Chat message' })
    return [chatFrame, chatInput]
}
