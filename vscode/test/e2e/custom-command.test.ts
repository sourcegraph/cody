import { expect } from '@playwright/test'

import { loggedEvents } from '../fixtures/mock-server'

import { sidebarSignin } from './common'
import { test } from './helpers'

const expectedOrderedEvent = [
    'CodyInstalled',
    'CodyVSCodeExtension:Auth:failed',
    'CodyVSCodeExtension:auth:clickOtherSignInOptions',
    'CodyVSCodeExtension:login:clicked',
    'CodyVSCodeExtension:auth:selectSigninMenu',
    'CodyVSCodeExtension:auth:fromToken',
    'CodyVSCodeExtension:Auth:connected',
    'CodyVSCodeExtension:chat:submitted',
    'CodyVSCodeExtension:command:menu:opened',
    'CodyVSCodeExtension:command:menu:opened',
]
test('open the Custom Commands in sidebar and add new user recipe', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)
    await expect(sidebar.getByText("Hello! I'm Cody.")).toBeVisible()
    await sidebar.getByRole('textbox', { name: 'Chat message' }).fill('/')
    await sidebar.locator('vscode-button').getByRole('img').click()
    // Create Command via UI
    const recipeName = 'ATestRecipes'
    await page.getByText('Configure Custom Commands...').click()
    await page.locator('a').filter({ hasText: 'New Custom Command...' }).click()
    await page.keyboard.type(recipeName)
    await page.keyboard.press('Enter')
    expect(loggedEvents).toEqual(expectedOrderedEvent)
})
