import { expect } from '@playwright/test'

import { sidebarExplorer, sidebarSignin } from './common'
import { test } from './helpers'

test('submit command from command palette', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)
    // Open the File Explorer view from the sidebar
    await sidebarExplorer(page).click()
    // Open the index.html file from the tree view
    await page.getByRole('treeitem', { name: 'index.html' }).locator('a').dblclick()

    // Bring the cody sidebar to the foreground
    await page.click('[aria-label="Cody"]')

    await page.getByText('Explain code').hover()
    await page.getByText('Explain code').click()

    // Find the chat iframe
    const chatPanelFrame = page.frameLocator('iframe.webview').last().frameLocator('iframe')
    // Check if the command shows up with the current file name
    await expect(chatPanelFrame.getByText('/explain @index.html')).toBeVisible()
    // Check if assistant responsed
    await expect(chatPanelFrame.getByText('hello from the assistant')).toBeVisible()

    // Close the file
    await page.getByRole('tab', { name: 'index.html', exact: true }).getByText('index.html').click()
    await page
        .getByRole('tab', { name: 'index.html, Editor Group 1' })
        .getByRole('button', { name: /Close.*/ })
        .click()

    // Click on the file link in chat
    await chatPanelFrame.getByRole('link', { name: '@index.html' }).click()
    // Check if the file is opened
    await expect(page.getByRole('list').getByText('index.html')).toBeVisible()
})
