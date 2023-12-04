import { expect } from '@playwright/test'

import { disableNotifications, sidebarExplorer, sidebarSignin } from './common'
import { test } from './helpers'

test('checks if chat history shows up in sidebar', async ({ page, sidebar }) => {
    // Turn off notification
    await disableNotifications(page)

    // Sign into Cody
    await sidebarSignin(page, sidebar)

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
})
