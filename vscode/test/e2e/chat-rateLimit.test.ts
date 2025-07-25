import { expect } from '@playwright/test'

import * as mockServer from '../fixtures/mock-server'

import { chatMessageRows, getChatInputs, getChatSidebarPanel, sidebarSignin } from './common'
import { type DotcomUrlOverride, type ExpectedV2Events, test as baseTest } from './helpers'

const test = baseTest.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })

test.extend<ExpectedV2Events>({
    expectedV2Events: [
        'cody.extension:installed',
        'cody.auth.login:firstEver',
        'cody.auth.login.token:clicked',
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
    const chatFrame = getChatSidebarPanel(page)
    const chatInput = getChatInputs(chatFrame).last()
    await chatInput.fill('test message')
    await chatInput.press('Enter')

    await expect(chatFrame.getByRole('heading', { name: 'Unable to Send Message' })).toBeVisible()
    await expect(chatMessageRows(chatFrame).getByRole('button', { name: 'Learn More' })).toBeVisible()
})

test.extend<ExpectedV2Events>({
    expectedV2Events: [
        'cody.extension:installed',
        'cody.auth.login:firstEver',
        'cody.auth.login.token:clicked',
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
    const chatFrame = getChatSidebarPanel(page)
    const chatInput = getChatInputs(chatFrame).last()
    await chatInput.fill('test message')
    await chatInput.press('Enter')

    await expect(chatFrame.getByRole('heading', { name: 'Unable to Send Message' })).toBeVisible()
    await expect(chatMessageRows(chatFrame).getByRole('button', { name: 'Learn More' })).toBeVisible()
})
