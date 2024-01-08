import { expect } from '@playwright/test'

import { resetLoggedEvents } from '../fixtures/mock-server'

import { sidebarExplorer, sidebarSignin } from './common'
import { test } from './helpers'

test.beforeEach(() => {
    resetLoggedEvents()
})
test('open the Custom Commands in sidebar and add new user recipe', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the File Explorer view from the sidebar
    await sidebarExplorer(page).click()
    // Open the index.html file from the tree view
    await page.getByRole('treeitem', { name: 'index.html' }).locator('a').dblclick()
    // Wait for index.html to fully open
    await page.getByRole('tab', { name: 'index.html' }).hover()

    // Bring the cody sidebar to the foreground
    await page.click('[aria-label="Cody"]')

    // Open the new chat panel
    await expect(page.getByText('Chat alongside your code, attach files,')).toBeVisible()

    await page.getByText('Custom commands').click()

    // Create Command via UI
    await page.keyboard.type('New Custom Command...')
    await page.locator('a').filter({ hasText: 'New Custom Command...' }).click()
    const recipeName = 'ATestRecipes'
    await page.keyboard.type(recipeName)
    await page.keyboard.press('Enter')
})
