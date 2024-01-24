import { expect } from '@playwright/test'

import { sidebarExplorer, sidebarSignin } from './common'
import { test } from './helpers'

test('execute command from sidebar', async ({ page, sidebar }) => {
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

    await page.getByText('Explain code').hover()
    await page.getByText('Explain code').click()

    // Find the chat iframe
    const chatPanelFrame = page.frameLocator('iframe.webview').last().frameLocator('iframe')

    // Check if the command shows the current file as context with the correct number of lines
    // When no selection is made, we will try to create smart selection from the cursor position
    // If there is no cursor position, we will use the visible content of the editor
    await chatPanelFrame.getByText('✨ Context: 12 lines from 1 file').click()

    // Check if assistant responsed
    await expect(chatPanelFrame.getByText('hello from the assistant')).toBeVisible()

    // Click on the file link in chat
    await chatPanelFrame.getByRole('button', { name: '@index.html' }).click()

    // Check if the file is opened
    await expect(page.getByRole('list').getByText('index.html')).toBeVisible()

    // Click on the 4th line of the file to check if smart selection works
    await page.getByText('<title>Hello Cody</title>').click()
    await expect(page.getByText('Explain code')).toBeVisible()
    await page.getByText('Explain code').click()
    await chatPanelFrame.getByText('✨ Context: 9 lines from 1 file').click()
})
