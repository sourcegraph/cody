import { expect } from '@playwright/test'

import { sendTestInfo } from '../fixtures/mock-server'

import { sidebarSignin } from './common'
import { test } from './helpers'

test('open the Custom Commands in sidebar and add new user recipe', async ({ page, sidebar }, testInfo) => {
    sendTestInfo(testInfo.title, testInfo.testId)

    // Sign into Cody
    await sidebarSignin(page, sidebar, testInfo)

    await expect(sidebar.getByText("Hello! I'm Cody.")).toBeVisible()

    await sidebar.getByRole('textbox', { name: 'Chat message' }).fill('/')
    await sidebar.locator('vscode-button').getByRole('img').click()

    // Create Command via UI
    const recipeName = 'A Test Recipes'
    await page.getByText('Configure Custom Commands...').click()
    await page.locator('a').filter({ hasText: 'New Custom User Command...' }).click()
    await page.keyboard.type(recipeName)
    await page.keyboard.press('Enter')
    await page.keyboard.type('this is a test')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
})
