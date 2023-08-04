import { expect } from '@playwright/test'

import { sidebarSignin } from './common'
import { test } from './helpers'

test('open the Custom Commands in sidebar and add new user recipe', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    await expect(sidebar.getByText("Hello! I'm Cody.")).toBeVisible()

    await sidebar.getByRole('textbox', { name: 'Text area' }).fill('/')
    await sidebar.locator('vscode-button').getByRole('img').click()

    // Create Command via UI
    const recipeName = 'A Test Recipes'
    await page.getByText('Configure Custom Commands...').click()
    await page.locator('a').filter({ hasText: 'New Custom Command...' }).click()
    await page.keyboard.type(recipeName)
    await page.keyboard.press('Enter')
    await page.keyboard.type('this is a test')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
})
