import { expect } from '@playwright/test'

import { sidebarExplorer, sidebarSignin } from './common'
import { assertEvents, test } from './helpers'
import { loggedEvents } from '../fixtures/mock-server'

const expectedEvents = ['CodyVSCodeExtension:command:test:executed']

test('unit test command (chat)', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the File Explorer view from the sidebar
    await sidebarExplorer(page).click()
    // Open the buzz.ts file from the tree view
    await page.getByRole('treeitem', { name: 'buzz.ts' }).locator('a').dblclick()
    await page.getByRole('tab', { name: 'buzz.ts' }).hover()

    // Bring the cody sidebar to the foreground
    await page.click('.badge[aria-label="Cody"]')

    await page.getByText('Generate unit tests (chat)').hover()
    await page.getByText('Generate unit tests (chat)').click()

    // Find the chat iframe
    const chatPanelFrame = page.frameLocator('iframe.webview').last().frameLocator('iframe')

    // Click on the chat view then press space to scroll to the bottom of the chat
    await chatPanelFrame
        .getByText('For more tips and tricks, see the Getting Started Guide and docs.')
        .click()
    await page.keyboard.down('Space')

    // Confirm the unit test command is using the relevant test file as context
    await chatPanelFrame.getByText('✨ Context: 29 lines from 2 files').click()

    await expect(chatPanelFrame.locator('span').filter({ hasText: '@buzz.ts:1-13' })).toBeVisible()
    await expect(chatPanelFrame.locator('span').filter({ hasText: '@buzz.test.ts:1-12' })).toBeVisible()

    // Check if assistant responsed
    await expect(chatPanelFrame.getByText('hello from the assistant')).toBeVisible()

    await assertEvents(loggedEvents, expectedEvents)
})

test('unit test command (edit)', async ({ page, sidebar }) => {
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

    await assertEvents(loggedEvents, expectedEvents)
})
