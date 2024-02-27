import { expect } from '@playwright/test'

import * as mockServer from '../fixtures/mock-server'
import { sidebarExplorer, sidebarSignin } from './common'
import { type DotcomUrlOverride, type ExpectedEvents, test as baseTest } from './helpers'

const test = baseTest.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })

test.extend<ExpectedEvents>({
    // list of events we expect this test to log, add to this list as needed
    expectedEvents: [
        'CodyInstalled',
        'CodyVSCodeExtension:Auth:failed',
        'CodyVSCodeExtension:auth:clickOtherSignInOptions',
        'CodyVSCodeExtension:login:clicked',
        'CodyVSCodeExtension:auth:selectSigninMenu',
        'CodyVSCodeExtension:auth:fromToken',
        'CodyVSCodeExtension:Auth:connected',
        'CodyVSCodeExtension:command:explain:executed',
        'CodyVSCodeExtension:chat-question:submitted',
        'CodyVSCodeExtension:chat-question:executed',
        'CodyVSCodeExtension:command:explain:executed',
        'CodyVSCodeExtension:chat-question:submitted',
        'CodyVSCodeExtension:chat-question:executed',
    ],
})('Explain Command & Smell Command & Chat from Command Menu', async ({ page, sidebar }) => {
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

    await page.getByText('Explain Code').hover()
    await page.getByText('Explain Code').click()

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
    await expect(page.getByText('Explain Code')).toBeVisible()
    await page.getByText('Explain Code').click()
    await chatPanel.getByText('Context: 21 lines from 1 file').click()
    await expect(chatPanel.locator('span').filter({ hasText: '@index.html:2-10' })).toBeVisible()
    const disabledEditButtons = chatPanel.getByTitle('Cannot Edit Command').locator('i')
    const editLastMessageButton = chatPanel.getByRole('button', { name: /^Edit Last Message / })
    // Edit button and Edit Last Message are shown on all command messages.
    await expect(disabledEditButtons).toHaveCount(0)
    await expect(editLastMessageButton).toBeVisible()

    // Smell Command
    // Running a command again should reuse the current cursor position
    await expect(page.getByText('Find Code Smells')).toBeVisible()
    await page.getByText('Find Code Smells').click()
    await expect(chatPanel.getByText('Context: 9 lines from 1 file')).toBeVisible()
    await chatPanel.getByText('Context: 9 lines from 1 file').click()
    await expect(chatPanel.locator('span').filter({ hasText: '@index.html:2-10' })).toBeVisible()
    await expect(disabledEditButtons).toHaveCount(0)
    await expect(editLastMessageButton).toBeVisible()
})

test.extend<ExpectedEvents>({
    // list of events we expect this test to log, add to this list as needed
    expectedEvents: [
        'CodyInstalled',
        'CodyVSCodeExtension:Auth:failed',
        'CodyVSCodeExtension:auth:clickOtherSignInOptions',
        'CodyVSCodeExtension:login:clicked',
        'CodyVSCodeExtension:auth:selectSigninMenu',
        'CodyVSCodeExtension:auth:fromToken',
        'CodyVSCodeExtension:Auth:connected',
        'CodyVSCodeExtension:command:codelens:clicked',
        'CodyVSCodeExtension:menu:command:default:clicked',
    ],
})('Generate Unit Test Command (Edit)', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the File Explorer view from the sidebar
    await sidebarExplorer(page).click()
    // Open the buzz.ts file from the tree view
    await page.getByRole('treeitem', { name: 'buzz.ts' }).locator('a').dblclick()
    await page.getByRole('tab', { name: 'buzz.ts' }).hover()

    // Click on the Cody command code lenses to execute the unit test command
    await page.getByRole('button', { name: 'A Cody' }).click()
    await page.getByText('Generate Unit Tests').click()

    // The test file for the buzz.ts file should be opened automatically
    await page.getByText('buzz.test.ts').hover()

    // Code lens should be visible
    await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()
})

test.extend<ExpectedEvents>({
    // list of events we expect this test to log, add to this list as needed
    expectedEvents: [
        'CodyInstalled',
        'CodyVSCodeExtension:Auth:failed',
        'CodyVSCodeExtension:auth:clickOtherSignInOptions',
        'CodyVSCodeExtension:login:clicked',
        'CodyVSCodeExtension:auth:selectSigninMenu',
        'CodyVSCodeExtension:auth:fromToken',
        'CodyVSCodeExtension:Auth:connected',
        'CodyVSCodeExtension:command:doc:executed',
        'CodyVSCodeExtension:fixupResponse:hasCode',
        'CodyVSCodeExtension:fixup:applied',
    ],
})('Document Command (Edit)', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the File Explorer view from the sidebar
    await sidebarExplorer(page).click()

    // Open the buzz.ts file from the tree view
    await page.getByRole('treeitem', { name: 'buzz.ts' }).locator('a').dblclick()
    await page.getByRole('tab', { name: 'buzz.ts' }).hover()

    // Click on some code within the function
    await page.getByText("fizzbuzz.push('Buzz')").click()

    // Bring the cody sidebar to the foreground
    await page.click('.badge[aria-label="Cody"]')

    // Trigger the documentaton command
    await page.getByText('Document Code').hover()
    await page.getByText('Document Code').click()

    // Code lens should be visible
    await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()

    // Code lens should be at the start of the function (range expanded from click position)
    expect(
        await page.getByText(
            '<title>Goodbye Cody < /title>export function fizzbuzz() {const fizzbuzz = []for '
        )
    ).toBeVisible()
})
