import { expect } from '@playwright/test'

import * as mockServer from '../fixtures/mock-server'

import { createEmptyChatPanel, sidebarSignin } from './common'
import { type DotcomUrlOverride, type ExpectedV2Events, test as baseTest } from './helpers'

const test = baseTest.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })

test.extend<ExpectedV2Events>({
    // list of events we expect this test to log, add to this list as needed
    expectedV2Events: [
        // 'cody.extension:installed', // ToDo: Uncomment once this bug is resolved: https://github.com/sourcegraph/cody/issues/3825
        'cody.extension:savedLogin',
        'cody.codyIgnore:hasFile',
        'cody.auth.login:clicked',
        'cody.auth.signin.menu:clicked',
        'cody.auth.login:firstEver',
        'cody.auth.signin.token:clicked',
        'cody.auth:connected',
        'cody.chat-question:submitted',
        'cody.chat-question:executed',
        'cody.chatResponse:noCode',
        'cody.upsellUsageLimitCTA:shown',
    ],
})('shows upgrade rate limit message for free users', async ({ page, sidebar }) => {
    await fetch(`${mockServer.SERVER_URL}/.test/completions/triggerRateLimit/free`, {
        method: 'POST',
    })

    await sidebarSignin(page, sidebar)
    const [chatFrame, chatInput] = await createEmptyChatPanel(page)
    await chatInput.fill('test message')
    await chatInput.press('Enter')

    await expect(chatFrame.getByRole('heading', { name: 'Upgrade to Cody Pro' })).toBeVisible()
    await expect(chatFrame.getByRole('button', { name: 'Upgrade' })).toBeVisible()
})

test.extend<ExpectedV2Events>({
    expectedV2Events: [
        // 'cody.extension:installed', // ToDo: Uncomment once this bug is resolved: https://github.com/sourcegraph/cody/issues/3825
        'cody.extension:savedLogin',
        'cody.codyIgnore:hasFile',
        'cody.auth.login:clicked',
        'cody.auth.signin.menu:clicked',
        'cody.auth.login:firstEver',
        'cody.auth.signin.token:clicked',
        'cody.auth:connected',
        'cody.chat-question:submitted',
        'cody.chat-question:executed',
        'cody.chatResponse:noCode',
        'cody.abuseUsageLimitCTA:shown',
    ],
})('shows standard rate limit message for pro users', async ({ page, sidebar }) => {
    await fetch(`${mockServer.SERVER_URL}/.test/completions/triggerRateLimit/pro`, {
        method: 'POST',
    })

    await sidebarSignin(page, sidebar)
    const [chatFrame, chatInput] = await createEmptyChatPanel(page)
    await chatInput.fill('test message')
    await chatInput.press('Enter')

    await expect(chatFrame.getByRole('heading', { name: 'Unable to Send Message' })).toBeVisible()
    await expect(chatFrame.getByRole('button', { name: 'Learn More' })).toBeVisible()
})

test.extend<ExpectedV2Events>({
    expectedV2Events: [
        // 'cody.extension:installed', // ToDo: Uncomment once this bug is resolved: https://github.com/sourcegraph/cody/issues/3825
        'cody.extension:savedLogin',
        'cody.codyIgnore:hasFile',
        'cody.auth.login:clicked',
        'cody.auth.signin.menu:clicked',
        'cody.auth.login:firstEver',
        'cody.auth.signin.token:clicked',
        'cody.auth:connected',
        'cody.chat-question:submitted',
        'cody.chat-question:executed',
        'cody.chatResponse:noCode',
        'cody.abuseUsageLimitCTA:shown',
    ],
})('shows standard rate limit message for non-dotCom users', async ({ page, sidebar }) => {
    await fetch(`${mockServer.SERVER_URL}/.test/completions/triggerRateLimit`, {
        method: 'POST',
    })

    await sidebarSignin(page, sidebar)
    const [chatFrame, chatInput] = await createEmptyChatPanel(page)
    await chatInput.fill('test message')
    await chatInput.press('Enter')

    await expect(chatFrame.getByRole('heading', { name: 'Unable to Send Message' })).toBeVisible()
    await expect(chatFrame.getByRole('button', { name: 'Learn More' })).toBeVisible()
})
