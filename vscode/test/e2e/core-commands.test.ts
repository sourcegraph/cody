import { expect } from '@playwright/test'

import { sidebarExplorer, sidebarSignin } from './common'
import { type DotcomUrlOverride, assertEvents, test as baseTest } from './helpers'
import * as mockServer from '../fixtures/mock-server'

const test = baseTest.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })

test('Explain Command & Smell Command & Chat from Command Menu', async ({ page, sidebar }) => {
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
    const chatPanel = page.frameLocator('iframe.webview').last().frameLocator('iframe')

    // Check if the command shows the current file as context with the correct number of lines
    // When no selection is made, we will try to create smart selection from the cursor position
    // If there is no cursor position, we will use the visible content of the editor
    // NOTE: Core commands context should not start with ✨
    await chatPanel.getByText('Context: 12 lines from 1 file').click()

    // Check if assistant responsed
    await expect(chatPanel.getByText('hello from the assistant')).toBeVisible()

    // Click on the file link in chat
    await chatPanel.getByRole('button', { name: '@index.html' }).click()

    // Check if the file is opened
    await expect(page.getByRole('list').getByText('index.html')).toBeVisible()

    // Explain Command
    // Click on the 4th line of the file before running Explain
    // to check if smart selection and the explain command works.
    await page.getByText('<title>Hello Cody</title>').click()
    await expect(page.getByText('Explain code')).toBeVisible()
    await page.getByText('Explain code').click()
    await chatPanel.getByText('Context: 9 lines from 1 file').click()
    const disabledEditButtons = chatPanel.getByTitle('Cannot Edit Command').locator('i')
    const editLastMessageButton = chatPanel.getByRole('button', { name: /^Edit Last Message / })
    // Edit button should shows as disabled for all command messages.
    // Edit Last Message are removed if last submitted message is a command.
    await expect(disabledEditButtons).toHaveCount(1)
    await expect(editLastMessageButton).not.toBeVisible()

    // Smell Command
    // Running a command again should reuse the current cursor position
    await expect(page.getByText('Identify code smells')).toBeVisible()
    await page.getByText('Identify code smells').click()
    await expect(chatPanel.getByText('Context: 9 lines from 1 file')).toBeVisible()
    await expect(disabledEditButtons).toHaveCount(1)
    await expect(editLastMessageButton).not.toBeVisible()

    // Submit a chat question via command menu using ask option
    await page.getByRole('tab', { name: 'index.html' }).click()
    await page.getByRole('button', { name: /Commands \(.*/ }).dblclick()
    const commandInputBox = page.getByPlaceholder(/Search for a command or enter/)
    await expect(commandInputBox).toBeVisible()
    await commandInputBox.fill('hello cody')
    await page.getByLabel('ask, Ask a question').locator('a').click()
    // the question should show up in the chat panel on submit
    await chatPanel.getByText('hello cody').click()

    const expectedEvents = [
        'CodyVSCodeExtension:command:explain:executed',
        'CodyVSCodeExtension:command:smell:executed',
    ]
    await assertEvents(mockServer.loggedEvents, expectedEvents)
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
    await page.getByText('test').click()

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
    await assertEvents(mockServer.loggedEvents, expectedEvents)
})
