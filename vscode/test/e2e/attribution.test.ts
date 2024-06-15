import { expect } from '@playwright/test'

import * as mockServer from '../fixtures/mock-server'

import { createEmptyChatPanel, sidebarSignin } from './common'
import { type DotcomUrlOverride, type ExpectedEvents, test as baseTest } from './helpers'

const test = baseTest
    .extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })
    .extend<ExpectedEvents>({
        // list of events we expect this test to log, add to this list as needed
        expectedEvents: [
            'CodyInstalled',
            'CodyVSCodeExtension:auth:clickOtherSignInOptions',
            'CodyVSCodeExtension:login:clicked',
            'CodyVSCodeExtension:auth:selectSigninMenu',
            'CodyVSCodeExtension:auth:fromToken',
            'CodyVSCodeExtension:Auth:connected',
            'CodyVSCodeExtension:chat-question:submitted',
            'CodyVSCodeExtension:chat-question:executed',
            'CodyVSCodeExtension:chatResponse:hasCode',
        ],
    })

test('attribution search enabled in chat', async ({ page, sidebar, expectedEvents }) => {
    await fetch(`${mockServer.SERVER_URL}/.test/attribution/enable`, { method: 'POST' })
    await sidebarSignin(page, sidebar)
    const [chatFrame, chatInput] = await createEmptyChatPanel(page)
    await chatInput.fill('show me a code snippet')
    await chatInput.press('Enter')
    await expect(chatFrame.getByTestId('attribution-indicator')).toBeVisible()
})

test('attribution search disabled in chat', async ({ page, sidebar, expectedEvents }) => {
    await fetch(`${mockServer.SERVER_URL}/.test/attribution/disable`, { method: 'POST' })
    await sidebarSignin(page, sidebar)
    const [chatFrame, chatInput] = await createEmptyChatPanel(page)
    await chatInput.fill('show me a code snippet')
    await chatInput.press('Enter')
    await expect(chatFrame.getByTestId('attribution-indicator')).toBeHidden()
})
