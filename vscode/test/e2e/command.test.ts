import { expect } from '@playwright/test'

import { sidebarExplorer, sidebarSignin } from './common'
import { assertEvents, test } from './helpers'
import { loggedEvents } from '../fixtures/mock-server'

test('execute explain command from sidebar', async ({ page, sidebar }) => {
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

    // Edit button should shows up next to the message and is editable
    const editButtons = chatPanelFrame.locator('.codicon-edit')
    await expect(editButtons).toHaveCount(1)
    await expect(chatPanelFrame.getByTitle('Edit Your Message').locator('i')).toBeVisible()

    // You can submit a chat question via command menu using /ask
    await page.getByRole('tab', { name: 'index.html' }).click()
    await page.getByRole('button', { name: /Commands \(.*/ }).click()
    await page.getByPlaceholder('Search for a command or enter your question here...').fill('hello cody')
    await page.getByLabel('/ask, Ask a question').locator('a').click()
    // the question should show up in the chat panel on submit
    await chatPanelFrame.getByText('hello cody').click()

    const expectedEvents = ['CodyVSCodeExtension:command:explain:executed']
    await assertEvents(loggedEvents, expectedEvents)
})

test('Generate Unit Test Command (Edit)', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the File Explorer view from the sidebar
    await sidebarExplorer(page).click()
    // Open the buzz.ts file from the tree view
    await page.getByRole('treeitem', { name: 'buzz.ts' }).locator('a').dblclick()
    await page.getByRole('tab', { name: 'buzz.ts' }).hover()

    // Click on the Cody command code lenses to execute the unit test command
    await page.getByRole('button', { name: 'A Cody' }).click()
    await page.getByText('/test').click()

    // The test file for the buzz.ts file should be opened automatically
    await page.getByText('buzz.test.ts').hover()

    // Code lens should be visible
    await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()

    const expectedEvents = [
        'CodyVSCodeExtension:command:test:executed',
        'CodyVSCodeExtension:fixupResponse:hasCode',
        'CodyVSCodeExtension:fixup:applied',
    ]
    await assertEvents(loggedEvents, expectedEvents)
})
