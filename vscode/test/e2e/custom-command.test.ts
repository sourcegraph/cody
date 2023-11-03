import { expect } from '@playwright/test'

import { resetLoggedEvents } from '../fixtures/mock-server'

import { sidebarSignin } from './common'
import { test } from './helpers'

test.beforeEach(() => {
    resetLoggedEvents()
})
test('open the Custom Commands in sidebar and add new user recipe', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)
    await expect(sidebar.getByText("Hello! I'm Cody.")).toBeVisible()
    await sidebar.getByRole('textbox', { name: 'Chat message' }).fill('/')
    await sidebar.getByTitle('Configure Custom Commands').click()
    // Create Command via UI
    await page.locator('a').filter({ hasText: 'New Custom Command...' }).click()
    const recipeName = 'ATestRecipes'
    await page.keyboard.type(recipeName)
    await page.keyboard.press('Enter')
})
