import { expect } from '@playwright/test'

import { loggedEvents, loggedV2Events, resetLoggedEvents } from '../fixtures/mock-server'

import { sidebarExplorer, sidebarSignin } from './common'
import { assertEvents, test } from './helpers'

const expectedEvents = [
    'CodyVSCodeExtension:command:edit:executed',
    'CodyVSCodeExtension:keywordContext:searchDuration',
    'CodyVSCodeExtension:recipe:fixup:executed',
    'CodyVSCodeExtension:fixupResponse:hasCode',
    'CodyVSCodeExtension:fixup:applied',
]
test.beforeEach(() => {
    resetLoggedEvents()
})
test('task tree view for non-stop cody', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the Explorer view from the sidebar
    await sidebarExplorer(page).click()

    // Open the index.html file from the tree view
    await page.getByRole('treeitem', { name: 'index.html' }).locator('a').dblclick()

    // Bring the cody sidebar to the foreground
    await page.click('[aria-label="Cody"]')

    // Expand the task tree view
    await page.getByRole('button', { name: 'Fixups Section' }).click()

    // Find the text hello cody, and then highlight the text
    await page.getByText('<title>Hello Cody</title>').click()

    // Hightlight the whole line
    await page.keyboard.down('Shift')
    await page.keyboard.press('ArrowDown')

    // Open the command palette by clicking on the Cody Icon
    await page.getByRole('button', { name: 'Commands' }).click()
    // Navigate to fixup input
    await page.getByRole('option', { name: 'Edit code' }).click()

    // Wait for the input box to appear
    await page.getByPlaceholder('Your instructions').click()
    // Type in the instruction for fixup
    await page.keyboard.type('replace hello with goodbye')
    // Press enter to submit the fixup
    await page.keyboard.press('Enter')

    // Expect to see the fixup instruction in the task tree view
    await expect(page.getByText('1 fixup, 1 applied')).toBeVisible()
    await expect(page.getByText('No pending Cody fixups')).not.toBeVisible()

    // Close the file tab and then clicking on the tree item again should open the file again
    // TODO: Re-enable this when FixupContentStore can provide virtual documents
    // for files which have been closed and reopened.
    // await page.getByRole('button', { name: /^Close.*/ }).click()
    // await expect(page.getByText('<title>Hello Cody</title>')).not.toBeVisible()
    // await page.locator('a').filter({ hasText: 'replace hello with goodbye' }).click()
    // await expect(page.getByText('<title>Hello Cody</title>')).toBeVisible()

    // Diff view button
    await page.locator('a').filter({ hasText: 'replace hello with goodbye' }).click()
    await page.getByRole('button', { name: 'Show diff for fixup' }).click()
    await expect(page.getByText(/^Cody Edit Diff View.*/)).toBeVisible()

    // Accept fixup button on Click
    await page.locator('a').filter({ hasText: 'replace hello with goodbye' }).click()
    await page.getByRole('button', { name: 'Accept fixup' }).click()
    await expect(page.getByText('No pending Cody fixups')).toBeVisible()

    // Collapse the task tree view
    await page.getByRole('button', { name: 'Fixups Section' }).click()
    await expect(page.getByText('No pending Cody fixups')).not.toBeVisible()
    await assertEvents(loggedEvents, expectedEvents)
    await assertEvents(loggedV2Events, [
        'cody.auth/connected',
        'cody.command.edit/executed',
        'cody.recipe.fixup/executed',
        'cody.fixup.apply/succeeded',
    ])
})
