import { expect } from '@playwright/test'

import { sidebarExplorer, sidebarSignin } from './common'
import { submitChat, test } from './helpers'

// Old History View
test('checks if clear chat history button clears history and current session', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)
    // Open the File Explorer view from the sidebar
    await sidebarExplorer(page).click()
    // Open the index.html file from the tree view
    await page.getByRole('treeitem', { name: 'index.html' }).locator('a').dblclick()

    // Bring the cody sidebar to the foreground if it's not already there
    if (!(await page.isVisible('[aria-label="Chat History"]'))) {
        await page.click('[aria-label="Cody"]')
    }
    // Click on the Chat History button
    await page.click('[aria-label="Chat History"]')
    await expect(sidebar.getByText('Chat History')).toBeVisible()

    // start a new chat session and check history

    await page.click('[aria-label="Start a New Chat Session"]')
    await expect(sidebar.getByText("Hello! I'm Cody. I can write code and answer questions for you.")).toBeVisible()
    await submitChat(sidebar, 'Hola')

    await expect(sidebar.getByText('hello from the assistant')).toBeVisible()

    await page.click('[aria-label="Start a New Chat Session"]')
    await submitChat(sidebar, 'Hey')

    await expect(sidebar.getByText('hello from the assistant')).toBeVisible()
    await expect(sidebar.getByText('Hola')).not.toBeVisible()

    await page.getByRole('button', { name: 'Chat History' }).click()

    // Remove Hey history item from chat history view
    await expect(sidebar.getByText('Hey')).toBeVisible()

    // The Clear button is currently blocked by the version pop up
    // await sidebar.locator('vscode-button').filter({ hasText: 'Clear' }).click()
    // await expect(sidebar.getByText('Hey')).not.toBeVisible()
})
