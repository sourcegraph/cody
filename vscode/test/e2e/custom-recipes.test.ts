import { expect } from '@playwright/test'

import { sidebarSignin } from './common'
import { test } from './helpers'

test('start a fixup job from inline chat with valid auth', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    await expect(sidebar.getByText("Hello! I'm Cody.")).toBeVisible()

    await sidebar.getByRole('button', { name: 'Recipes' }).click()
    // Check if the Custom Recipes UI shows up
    await expect(sidebar.getByText('Custom Recipes')).toBeVisible()
    // Check if default recipes are present
    await expect(sidebar.getByText('Generate a unit test')).toBeVisible()

    // Open the quick pick menu
    await sidebar.locator('vscode-button').getByTitle('Update your custom recipes').click()
    await page.getByRole('option', { name: 'Create a New User Recipe, recipes manager' }).locator('a').click()
    await expect(page.getByText('Cody Custom Recipes - New Recipe')).toBeVisible()
})
