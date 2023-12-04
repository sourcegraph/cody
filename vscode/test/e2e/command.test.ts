import { expect } from '@playwright/test'

import { sidebarExplorer, sidebarSignin } from './common'
import { test } from './helpers'

test.skip('submit command from command palette', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)
    // Open the File Explorer view from the sidebar
    await sidebarExplorer(page).click()
    // Open the index.html file from the tree view
    await page.getByRole('treeitem', { name: 'index.html' }).locator('a').dblclick()

    // Bring the cody sidebar to the foreground
    await page.click('[aria-label="Cody"]')

    // Find the chat iframe inside the editor iframe
    const chatFrameLocator = page.frameLocator('iframe.webview').frameLocator('iframe')

    await page.getByText('Explain code').hover()
    await page.getByText('Explain code').click()

    // Check if the command shows up with the current file name
    await expect(chatFrameLocator.getByText('/explain @index.html')).toBeVisible()
    // Check if assistant responsed
    await expect(chatFrameLocator.getByText('hello from the assistant')).toBeVisible()

    // Close the file
    await page.getByRole('button', { name: /Close.*/ }).click()

    // Click on the file link in chat
    await chatFrameLocator.getByRole('link', { name: '@index.html' }).click()
    // Check if the file is opened
    await expect(page.getByRole('list').getByText('index.html')).toBeVisible()
})
