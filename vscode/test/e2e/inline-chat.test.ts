import { expect } from '@playwright/test'

import { loggedEvents, resetLoggedEvents } from '../fixtures/mock-server'

import { sidebarExplorer, sidebarSignin } from './common'
import { test } from './helpers'

const expectedOrderedEvents = [
    'CodyVSCodeExtension:keywordContext:searchDuration',
    'CodyVSCodeExtension:recipe:inline-chat:executed',
]

test.beforeEach(() => {
    resetLoggedEvents()
})
test('start a fixup job from inline chat with valid auth', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the Explorer view from the sidebar
    await sidebarExplorer(page).click()

    // Open the index.html file from the tree view
    await page.getByRole('treeitem', { name: 'index.html' }).locator('a').dblclick()

    // Click on line number 6 to open the comment thread
    await page.locator('.comment-diff-added').nth(5).hover()
    await page.locator('.comment-diff-added').nth(5).click()

    // After opening the comment thread, we need to wait for the editor to load
    await page.waitForSelector('.monaco-editor')
    await page.waitForSelector('.monaco-text-button')

    // Type in the question with the '<' and '>' to check for regression
    await page.keyboard.type('what is a ```<div>``` tag?')
    // Click on the submit button
    await page.click('.monaco-text-button')

    // Make sure the < and > characters were not escaped
    await expect(page.locator('[id="workbench\\.parts\\.editor"]').getByText('what is a <div> tag?``')).toBeVisible()
    await expect.poll(() => loggedEvents).toEqual(expectedOrderedEvents)
})
