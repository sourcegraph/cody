import { expect } from '@playwright/test'

import { codyEditorCommandButtonRole, sidebarExplorer, sidebarSignin } from './common'
import { test } from './helpers'

test('checks if clear chat history button clears history and current session', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)
    // Open the File Explorer view from the sidebar
    await sidebarExplorer(page).click()
    // Open the index.html file from the tree view
    await page.getByRole('treeitem', { name: 'index.html' }).locator('a').dblclick()

    // Bring the cody sidebar to the foreground
    await page.click('[aria-label="Cody"]')
    await page.click('[aria-label="Chat History"]')
    await expect(sidebar.getByText('Chat History')).toBeVisible()

    // start a new chat session and check history

    await page.click('[aria-label="Start a New Chat Session"]')
    await expect(sidebar.getByText("Hello! I'm Cody. I can write code and answer questions for you.")).toBeVisible()

    await sidebar.getByRole('textbox', { name: 'Chat message' }).fill('Hola')
    await sidebar.locator('vscode-button').getByRole('img').click()

    await expect(sidebar.getByText('hello from the assistant')).toBeVisible()

    await page.click('[aria-label="Start a New Chat Session"]')
    await sidebar.getByRole('textbox', { name: 'Chat message' }).fill('Hey')
    await sidebar.locator('vscode-button').getByRole('img').click()

    await expect(sidebar.getByText('hello from the assistant')).toBeVisible()
    await expect(sidebar.getByText('Hola')).not.toBeVisible()

    await page.getByRole('button', { name: 'Chat History' }).click()

    // Remove Hey history item from chat history view
    await expect(sidebar.getByText('Hey')).toBeVisible()
    await sidebar.locator('vscode-button').filter({ hasText: 'Clear' }).click()
    await expect(sidebar.getByText('Hey')).not.toBeVisible()

    await page.click('[aria-label="Start a New Chat Session"]')

    // Open the Cody Commands palette and run a command
    await page.getByRole('button', codyEditorCommandButtonRole).click()
    await page.keyboard.type('/explain')
    await page.keyboard.press('Enter')

    // Check if the old message "Hey" is cleared
    await expect(sidebar.getByText('Hey')).not.toBeVisible()
})
