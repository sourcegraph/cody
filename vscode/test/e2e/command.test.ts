import { expect } from '@playwright/test'

import { codyEditorCommandButtonRole, sidebarExplorer, sidebarSignin } from './common'
import { test } from './helpers'

// TODO bee fix
test.skip('submit command from command palette', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)
    // Open the File Explorer view from the sidebar
    await sidebarExplorer(page).click()
    // Open the index.html file from the tree view
    await page.getByRole('treeitem', { name: 'index.html' }).locator('a').dblclick()

    // Bring the cody sidebar to the foreground
    await page.click('[aria-label="Cody"]')
    await expect(sidebar.getByText("Hello! I'm Cody. I can write code and answer questions for you.")).toBeVisible()

    await page.click('[aria-label="Start a New Chat Session"]')

    // Open the Cody Commands palette and run a command
    await page.getByRole('button', codyEditorCommandButtonRole).click()
    await page.keyboard.type('/explain')
    await page.keyboard.press('Enter')

    // Check if the command shows up with the current file name
    await expect(sidebar.getByText('/explain @index.html')).toBeVisible()
    // Check if assistant responsed
    await expect(sidebar.getByText('hello from the assistant')).toBeVisible()

    // Close the file
    await page.getByRole('button', { name: /Close.*/ }).click()

    // Click on the file link in chat
    await sidebar.getByRole('link', { name: '@index.html' }).click()
    // Check if the file is opened
    await expect(page.getByRole('list').getByText('index.html')).toBeVisible()
})
