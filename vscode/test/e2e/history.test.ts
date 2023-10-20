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

    // start a new chat session and check history

    await page.getByRole('button', { name: 'New Chat', exact: true }).click()

    await page.getByRole('heading', { name: 'Cody Chat' }).click()

    await page.getByRole('textbox', { name: 'Chat message' }).fill('Hola')
    await page.locator('vscode-button').getByRole('img').click()

    await expect(page.getByText('hello from the assistant')).toBeVisible()

    await page.getByRole('button', { name: 'Start a New Chat Session' }).click()
    await page.getByRole('textbox', { name: 'Chat message' }).fill('Hey')
    await page.locator('vscode-button').getByRole('img').click()

    await expect(page.getByText('hello from the assistant')).toBeVisible()
    await expect(page.getByText('Hola')).not.toBeVisible()

    // Remove Hey history item from chat history view
    await expect(page.getByText('Hey')).toBeVisible()
    await page.locator('vscode-button').filter({ hasText: 'Clear' }).click()
    await expect(page.getByText('Hey')).not.toBeVisible()

    await page.getByRole('button', { name: 'Start a New Chat Session' }).click()

    // Open the Cody Commands palette and run a command
    await page.getByRole('button', codyEditorCommandButtonRole).click()
    await page.keyboard.type('/explain')
    await page.keyboard.press('Enter')

    // Check if the old message "Hey" is cleared
    await expect(page.getByText('Hey')).not.toBeVisible()
})
