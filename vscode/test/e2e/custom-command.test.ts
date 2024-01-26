import { expect } from '@playwright/test'

import { resetLoggedEvents } from '../fixtures/mock-server'

import { sidebarExplorer, sidebarSignin } from './common'
import { test } from './helpers'

test.beforeEach(() => {
    resetLoggedEvents()
})
test('open the Custom Commands in sidebar and add new user command', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the File Explorer view from the sidebar
    await sidebarExplorer(page).click()
    // Open the index.html file from the tree view
    await page.getByRole('treeitem', { name: 'index.html' }).locator('a').dblclick()
    // Wait for index.html to fully open
    await page.getByRole('tab', { name: 'index.html' }).hover()

    // Bring the cody sidebar to the foreground
    await page.click('.badge[aria-label="Cody"]')

    // Open the new chat panel
    await expect(page.getByText('Chat alongside your code, attach files,')).toBeVisible()

    // Minimize other sidebar items to make room for the command view,
    // else the test will fail because the Custom Command button is not visible
    await page.getByLabel('Natural Language Search (Beta) Section').click()
    await page.getByLabel('Settings & Support Section').click()
    await page.getByLabel('Chats Section').click()

    // Click the Custom Commands button in the Command view
    await page.getByText('Custom commands').click()

    // Create Command via UI
    await page.keyboard.type('New Custom Command...')
    await page.locator('a').filter({ hasText: 'New Custom Command...' }).click()
    const commandName = 'ATestCommand'
    await page.keyboard.type(commandName)
    await page.keyboard.press('Enter')

    // Bring the sidebar items back to view
    await page.getByLabel('Natural Language Search (Beta) Section').click()
    await page.getByLabel('Settings & Support Section').click()
    await page.getByLabel('Chats Section').click()
})
