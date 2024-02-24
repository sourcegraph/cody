import { expect } from '@playwright/test'

import * as mockServer from '../fixtures/mock-server'

import { sidebarExplorer, sidebarSignin } from './common'
import { type DotcomUrlOverride, type ExpectedEvents, test as baseTest } from './helpers'

const test = baseTest.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })

test.extend<ExpectedEvents>({
    // list of events we expect this test to log, add to this list as needed
    expectedEvents: [
        'CodyVSCodeExtension:command:edit:executed',
        'CodyVSCodeExtension:fixupResponse:hasCode',
        'CodyVSCodeExtension:fixup:codeLens:clicked', // each code lens clicked
        'CodyVSCodeExtension:fixup:applied', // after clicking 'Accept'
        'CodyVSCodeExtension:fixup:reverted', // after clicking 'Undo'
    ],
})('code lenses for edit (fixup) task', async ({ page, sidebar, expectedEvents }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the Explorer view from the sidebar
    await sidebarExplorer(page).click()
    // Open the index.html file from the tree view
    await page.getByRole('treeitem', { name: 'index.html' }).locator('a').dblclick()
    // Wait for index.html to fully open
    await page.getByRole('tab', { name: 'index.html' }).hover()

    // Find the text hello cody, and then highlight the text
    await page.getByText('<title>Hello Cody</title>').click()
    await page.keyboard.down('Shift')
    await page.keyboard.press('ArrowDown')

    // Enter instruction in the command palette via clicking on the Cody Icon
    await page.getByRole('button', { name: 'Commands' }).click()
    await page.getByRole('option', { name: 'Edit code' }).click()

    const inputBox = page.getByPlaceholder(/^Enter edit instructions \(type @ to include code/)
    const instruction = 'replace hello with goodbye'
    const inputTitle = /^Edit index.html:(\d+).* with Cody$/
    const showDiffLens = page.getByRole('button', { name: 'Show Diff' })
    const acceptLens = page.getByRole('button', { name: 'Accept' })
    const retryLens = page.getByRole('button', { name: 'Edit & Retry' })
    const undoLens = page.getByRole('button', { name: 'Undo' })

    // Wait for the input box to appear with the document name in title
    await expect(page.getByText(inputTitle)).toBeVisible()
    await inputBox.focus()
    await inputBox.fill(instruction)
    await page
        .locator('a')
        .filter({ hasText: /^Submit$/ })
        .click() // Submit via Submit button

    // Code Lenses should appear
    await expect(showDiffLens).toBeVisible()
    await expect(acceptLens).toBeVisible()
    await expect(retryLens).toBeVisible()
    await expect(undoLens).toBeVisible()

    // The text in the doc should be replaced
    await expect(page.getByText('>Hello Cody</')).not.toBeVisible()
    await expect(page.getByText('>Goodbye Cody</')).toBeVisible()

    // Show Diff: Create a new editor with diff view
    // The code lenses should stay after moving from diff view back to index.html
    await showDiffLens.click()
    await expect(page.getByText(/^Cody Edit Diff View -/)).toBeVisible()
    await page.getByText(/^Cody Edit Diff View -/).click()
    await page.getByRole('tab', { name: 'index.html', exact: true }).click()
    await expect(showDiffLens).toBeVisible()
    await expect(acceptLens).toBeVisible()
    await expect(retryLens).toBeVisible()
    await expect(undoLens).toBeVisible()

    // Undo: remove all the changes made by edit
    await undoLens.click()
    await expect(page.getByText('>Hello Cody</')).toBeVisible()
    await expect(page.getByText('>Goodbye Cody</')).not.toBeVisible()

    // create another edit from the sidebar Edit button
    await page.getByText('7', { exact: true }).click()
    await page.click('.badge[aria-label="Cody"]')
    await page.getByText('Edit Code').click()
    await expect(page.getByText(inputTitle)).toBeVisible()
    await inputBox.focus()
    await inputBox.fill(instruction)
    await page.keyboard.press('Enter')
    await expect(page.getByText('>Hello Cody</')).not.toBeVisible()
    await expect(page.getByText('>Goodbye Cody</')).toBeVisible()

    // Retry: show the command palette with the previous instruction
    await expect(retryLens).toBeVisible()
    await retryLens.click()
    await expect(page.getByText(inputTitle)).toBeVisible()
    await expect(inputBox).toHaveValue(instruction)
    await inputBox.press('Escape')

    // Undo: revert document to previous state
    await undoLens.click()
    await expect(page.getByText('>Hello Cody</')).toBeVisible()
    await expect(page.getByText('>Goodbye Cody</')).not.toBeVisible()
})
