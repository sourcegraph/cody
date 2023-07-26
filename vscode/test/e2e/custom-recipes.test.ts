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

    // TODO: Open the quick pick menu
    await expect(sidebar.getByTitle('Open Custom Recipes Menu')).toBeVisible()
    await sidebar.getByTitle('Open Custom Recipes Menu').click()
    await page.getByText('Cody: Custom Recipes (Experimental)').click()
    await page.locator('a').filter({ hasText: 'Add User Recipe' }).click()
    await page.getByPlaceholder('e,g. Vulnerability Scanner').fill('Test Recipes')
    await page.getByPlaceholder('e,g. Vulnerability Scanner').press('Enter')
    await page.getByPlaceholder("e,g. 'Create five different test cases for the selected code''").fill('this is a test')
    await page.getByPlaceholder("e,g. 'Create five different test cases for the selected code''").press('Enter')
    await page.getByLabel('NoneExclude all types of context.').check()
    await page.getByRole('button', { name: 'OK' }).click()
    await sidebar.getByRole('button', { name: 'Test Recipes' }).click()
})
