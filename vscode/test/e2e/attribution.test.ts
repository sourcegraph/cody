import { expect } from '@playwright/test'

import * as mockServer from '../fixtures/mock-server'

import { getChatInputs, getChatSidebarPanel, sidebarSignin } from './common'
import { type DotcomUrlOverride, test as baseTest } from './helpers'

const test = baseTest.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })

test('attribution search enabled in chat', async ({ page, sidebar }) => {
    await fetch(`${mockServer.SERVER_URL}/.test/attribution/enable`, { method: 'POST' })
    await sidebarSignin(page, sidebar)
    const chatFrame = getChatSidebarPanel(page)
    const chatInput = getChatInputs(chatFrame)
    await chatInput.fill('show me a code snippet')
    await chatInput.press('Enter')
    await expect(chatFrame.getByTestId('attribution-indicator')).toBeVisible()
})

test('attribution search disabled in chat', async ({ page, sidebar }) => {
    await fetch(`${mockServer.SERVER_URL}/.test/attribution/disable`, { method: 'POST' })
    await sidebarSignin(page, sidebar)
    const chatFrame = getChatSidebarPanel(page)
    const chatInput = getChatInputs(chatFrame)
    await chatInput.fill('show me a code snippet')
    await chatInput.press('Enter')
    await expect(chatFrame.getByTestId('attribution-indicator')).toBeHidden()
})
