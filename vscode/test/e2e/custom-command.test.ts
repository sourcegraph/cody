import { expect } from '@playwright/test'

import { resetLoggedEvents } from '../fixtures/mock-server'

import { sidebarExplorer, sidebarSignin } from './common'
import { test } from './helpers'

test.beforeEach(() => {
    resetLoggedEvents()
})

test('add a new user command via the custom commands menu', async ({ page, sidebar }) => {
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

    await page.getByText('Custom commands').click()

    const commandName = 'ATestCommand'
    const description = 'A test command added via menu'
    const prompt = 'The test command has been created'

    // Create a new command via menu
    await page.keyboard.type('New Custom Command...')
    await page.locator('a').filter({ hasText: 'New Custom Command...' }).click()
    // Enter command name
    await expect(page.getByText('New Custom Cody Command: Slash Name')).toBeVisible()
    await page.keyboard.type(commandName)
    await page.keyboard.press('Enter')
    // Enter description
    await expect(page.getByText('New Custom Cody Command: Description')).toBeVisible()
    await page.keyboard.type(description)
    await page.keyboard.press('Enter')
    // Enter prompt
    await expect(page.getByText('New Custom Cody Command: Prompt')).toBeVisible()
    await page.keyboard.type(prompt)
    await page.keyboard.press('Enter')
    // Use default context
    await expect(page.getByText('New Custom Cody Command: Context Options')).toBeVisible()
    await page.keyboard.press('Enter')
    // Save it to workspace settings
    await expect(page.getByText('New Custom Cody Command: Save To…')).toBeVisible()
    await expect(page.getByText('Workspace Settings.vscode/cody.json')).toBeVisible()
    await page.getByText('Workspace Settings.vscode/cody.json').click()

    // Show the new command in the menu and execute it
    await page.getByLabel('Custom Custom commands').locator('a').click()
    await page.getByPlaceholder('Search command to run...').fill(commandName)
    await expect(page.getByText(commandName)).toBeVisible()
    await page.getByText(commandName).click()

    // Confirm the command prompt is displayed in the chat panel on execution
    const chatPanel = page.frameLocator('iframe.webview').last().frameLocator('iframe')
    await expect(chatPanel.getByText(prompt)).toBeVisible()
})

test('execute a custom command defined in workspace cody.json', async ({ page, sidebar }) => {
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

    // Open the chat sidebar to click on the Custom Command option
    // Search for the command defined in cody.json and execute it
    await expect(page.getByText('Chat alongside your code, attach files,')).toBeVisible()

    // Test: context.currentDir
    await page.getByLabel('Custom Custom commands').locator('a').click()
    await expect(page.getByPlaceholder('Search command to run...')).toBeVisible()
    await page.getByPlaceholder('Search command to run...').fill('currentDir')
    await await expect(
        page
            .getByLabel(
                "/currentDir, Should have 4 context files from the current directory. Files start with '.' are skipped by default."
            )
            .locator('a')
    ).toBeVisible()
    await page.keyboard.press('Enter')

    const chatPanel = page.frameLocator('iframe.webview').last().frameLocator('iframe')

    await expect(chatPanel.getByText('Add four context files from the current directory.')).toBeVisible()
    // Show the current file numbers used as context
    await expect(chatPanel.getByText('✨ Context: 55 lines from 4 files')).toBeVisible()
    await chatPanel.getByText('✨ Context: 55 lines from 4 files').click()
    // Display the context files to confirm no hidden files are included
    await expect(chatPanel.locator('span').filter({ hasText: '@Main.java:1-9' })).toBeVisible()
    await expect(chatPanel.locator('span').filter({ hasText: '@buzz.test.ts:1-12' })).toBeVisible()
    await expect(chatPanel.locator('span').filter({ hasText: '@buzz.ts:1-15' })).toBeVisible()
    await expect(chatPanel.locator('span').filter({ hasText: '@index.html:1-11' })).toBeVisible()

    // Test: context.filePath
    await page.getByLabel('Custom Custom commands').locator('a').click()
    await expect(page.getByPlaceholder('Search command to run...')).toBeVisible()
    await page.getByPlaceholder('Search command to run...').click()
    await page.getByPlaceholder('Search command to run...').fill('/filePath')
    await page.keyboard.press('Enter')
    await expect(chatPanel.getByText('Add lib/batches/env/var.go as context.')).toBeVisible()
    // Should show 2 files with current file added as context
    await expect(chatPanel.getByText('✨ Context: 14 lines from 2 files')).toBeVisible()

    // Test: context.directory
    await page.getByLabel('Custom Custom commands').locator('a').click()
    await expect(page.getByPlaceholder('Search command to run...')).toBeVisible()
    await page.getByPlaceholder('Search command to run...').click()
    await page.getByPlaceholder('Search command to run...').fill('/directory')
    await page.keyboard.press('Enter')
    await expect(chatPanel.getByText('Directory has one context file.')).toBeVisible()
    await expect(chatPanel.getByText('✨ Context: 15 lines from 2 file')).toBeVisible()
    await chatPanel.getByText('✨ Context: 15 lines from 2 file').click()
    await expect(
        chatPanel.locator('span').filter({ hasText: '@lib/batches/env/var.go:1-1' })
    ).toBeVisible()
    // Click on the file link should open the file in the editor
    await chatPanel.getByRole('button', { name: '@lib/batches/env/var.go:1-1' }).click()
    await expect(page.getByRole('tab', { name: 'index.html' })).toBeVisible()
})
