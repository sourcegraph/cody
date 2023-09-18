import { expect } from '@playwright/test'

import { loggedEvents } from '../fixtures/mock-server'

import { sidebarExplorer, sidebarSignin } from './common'
import { test } from './helpers'

const expectedOrderedEvent = [
    'CodyInstalled',
    'CodyVSCodeExtension:Auth:failed',
    'CodyVSCodeExtension:auth:clickOtherSignInOptions',
    'CodyVSCodeExtension:login:clicked',
    'CodyVSCodeExtension:auth:selectSigninMenu',
    'CodyVSCodeExtension:auth:fromToken',
    'CodyVSCodeExtension:Auth:connected',
    'CodyVSCodeExtension:fixup:created',
    'CodyVSCodeExtension:keywordContext:searchDuration',
    'CodyVSCodeExtension:recipe:fixup:executed',
    'CodyVSCodeExtension:fixupResponse:hasCode',
    'CodyVSCodeExtension:chatResponse:noCode',
    'CodyVSCodeExtension:fixup:codeLens:clicked',
    'CodyVSCodeExtension:fixup:applied',
]
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

    // Type in the instruction for fixup
    await page.keyboard.type('/edit replace hello with goodbye')
    // Click on the submit button with the name Ask Cody
    await page.click('.monaco-text-button')

    // TODO: Capture processing state. It is currently to quick to capture the processing elements
    // Wait for the code lens to show up to ensure that the fixup has been applied
    // await expect(page.getByText('Processing by Cody')).toBeVisible()

    // Ensures Code Lens is added
    await expect(page.getByText('Fixup ready')).toBeVisible()
    await page.getByRole('button', { name: 'Apply' }).click()
    await expect(page.getByText('<title>Goodbye Cody</title>')).toBeVisible()
    expect(loggedEvents).toEqual(expectedOrderedEvent)
})
