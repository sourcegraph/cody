import { expect } from '@playwright/test'

import { sidebarExplorer, sidebarSignin } from './common'
import { test } from './helpers'

test('checks if chat history shows up in sidebar', async ({ page, sidebar }) => {
    // Turn off notification
    await page.getByRole('button', { name: 'Notifications' }).click()
    await page.getByRole('button', { name: 'Toggle Do Not Disturb Mode' }).click()

    // Sign into Cody
    await sidebarSignin(page, sidebar)

    await page.getByRole('button', { name: 'cody-logo-heavy, Cody Settings' }).click()
    await page
        .getByRole('option', { name: 'New Chat UI, Experimental, Enable new chat panel UI' })
        .locator('span')
        .filter({ hasText: 'Experimental' })
        .first()
        .click()

    // Open the File Explorer view from the sidebar
    await sidebarExplorer(page).click()
    // Open the index.html file from the tree view
    await page.getByRole('treeitem', { name: 'index.html' }).locator('a').dblclick()

    // Bring the cody sidebar to the foreground
    await page.click('[aria-label="Cody"]')

    // Open the new chat panel
    await expect(
        page.getByText('Chat alongside your code, attach files, add additional context, and try out diff')
    ).toBeVisible()
    await page.getByRole('button', { name: 'New Chat', exact: true }).click()

    // Create chat
    await page.getByRole('tab', { name: 'New Chat' }).getByText('New Chat').click()

    await page.keyboard.type('Hey')
    await page.keyboard.press('Enter')

    await page.getByRole('treeitem', { name: 'Hey' }).locator('div').filter({ hasText: 'Hey' }).nth(3).hover()
    await page.getByRole('button', { name: 'Rename Chat' }).click()
    await page.getByRole('combobox', { name: 'input' }).fill('Edited!')
    await page.getByRole('combobox', { name: 'input' }).press('Enter')
    await page.getByRole('treeitem', { name: 'Edited!' }).locator('div').filter({ hasText: 'Edited!' }).nth(3).click()
    await page.getByRole('tab', { name: 'Edited!' }).getByText('Edited!').click()
})
