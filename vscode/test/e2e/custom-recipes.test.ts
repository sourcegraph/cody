import { expect } from '@playwright/test'

import { sidebarSignin } from './common'
import { test } from './helpers'

test('open the custom recipes in sidebar and add new user recipe', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    await expect(sidebar.getByText("Hello! I'm Cody.")).toBeVisible()

    await sidebar.getByRole('button', { name: 'Recipes' }).click()

    // Check if the Custom Recipes UI shows up
    await expect(sidebar.getByText('Custom Recipes')).toBeVisible()

    // Check if default recipes are present
    await expect(sidebar.getByText('Generate Unit Tests')).toBeVisible()

    // Create Recipe via UI
    const recipeName = 'A Test Recipes'
    await expect(sidebar.getByTitle('Open Custom Recipes Menu')).toBeVisible()
    await sidebar.getByTitle('Open Custom Recipes Menu').click()
    await page.getByText('Cody: Custom Recipes (Experimental)').click()
    await page.locator('a').filter({ hasText: 'Add User Recipe' }).click()
    await page.keyboard.type(recipeName)
    await page.keyboard.press('Enter')
    await page.keyboard.type('this is a test')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    // await sidebar.locator('vscode-button').filter({ hasText: recipeName }).click()
})
