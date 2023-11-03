import { expect, Locator, Page } from '@playwright/test'

import { loggedEvents, resetLoggedEvents } from '../fixtures/mock-server'

import { sidebarExplorer, sidebarSignin } from './common'
import { test } from './helpers'

test.beforeEach(() => {
    resetLoggedEvents()
})
test('shows chat sidebar completion onboarding notice on first completion accept', async ({ page, sidebar }) => {
    const expectedEvents = [
        'CodyVSCodeExtension:completion:suggested',
        'CodyVSCodeExtension:completion:accepted',
        'CodyVSCodeExtension:completion:suggested',
        'CodyVSCodeExtension:completion:accepted',
        'CodyVSCodeExtension:completion:suggested',
    ]

    const indexFile = page.getByRole('treeitem', { name: 'index.html' }).locator('a')
    const editor = page.locator('[id="workbench\\.parts\\.editor"]')
    const notice = sidebar.locator('.onboarding-autocomplete')
    const noticeCloseButton = notice.locator('div[class^="_notice-close"] vscode-button')

    const firstAcceptedCompletion = editor.getByText('myFirstCompletion')
    // Use .first() to ignore additional instances of this text if inline completion shows
    // up again after completing.
    const otherAcceptedCompletion = editor.getByText('myNotFirstCompletion').first()

    // Sign into Cody.
    await sidebarSignin(page, sidebar)

    // Open the index.html file from explorer.
    await sidebarExplorer(page).click()
    await indexFile.dblclick()

    // Trigger inline-completion and ensure no notice (yet).
    await triggerInlineCompletionAfter(page, page.getByText('<body>'))
    await expect(notice).not.toBeVisible()

    // Accept the completion and expect the text to be added and
    // the notice to be shown.
    await acceptInlineCompletion(page)
    await expect(firstAcceptedCompletion).toBeVisible()
    await expect(notice).toBeVisible()

    // Close the notice.
    await noticeCloseButton.click()
    await expect(notice).not.toBeVisible()

    // Trigger/accept another completion, but don't expect the notification.
    await triggerInlineCompletionAfter(page, firstAcceptedCompletion)
    await acceptInlineCompletion(page)
    await expect(otherAcceptedCompletion).toBeVisible()
    await expect(notice).not.toBeVisible()
    await expect.poll(() => loggedEvents).toEqual(expectedEvents)
})

test('inline completion onboarding notice on first completion accept', async ({ page, sidebar }) => {
    const expectedEvents = [
        'CodyVSCodeExtension:completion:suggested', // First suggestion
        'CodyVSCodeExtension:completion:accepted', // First accept
        'CodyVSCodeExtension:completion:suggested', // Suggestion that appears immediately after accepting
        'CodyVSCodeExtension:completion:suggested', // Second suggestion after typing "a" to test hiding
        'CodyVSCodeExtension:completion:accepted', // Second accept
        'CodyVSCodeExtension:completion:suggested', // Suggestion that appears immediately after accepting
    ]

    const indexFile = page.getByRole('treeitem', { name: 'index.html' }).locator('a')
    const editor = page.locator('[id="workbench\\.parts\\.editor"]')
    // The text in the decoration is part of the CSS rule (it's in :after) so we can't locate it
    // directly, we just have to assume this is the only decoration in the editor during this test.
    // If that assumption ceases to be the case, this test will fail on the initial check that it's
    // not visible.
    const decoration = editor.locator('css=span[class*="TextEditorDecorationType"]')

    const firstAcceptedCompletion = editor.getByText('myFirstCompletion')
    // Use .first() to ignore additional instances of this text if inline completion shows
    // up again after completing.
    const otherAcceptedCompletion = editor.getByText('myNotFirstCompletion').first()

    // Sign into Cody.
    await sidebarSignin(page, sidebar)

    // Open the index.html file from explorer.
    await sidebarExplorer(page).click()
    await indexFile.dblclick()

    // Trigger inline-completion and ensure no notice (yet).
    await triggerInlineCompletionAfter(page, page.getByText('<body>'))
    await expect(decoration).not.toBeVisible()

    // Accept the completion and expect the text to be added and
    // the notice to be shown.
    await acceptInlineCompletion(page)
    await expect(firstAcceptedCompletion).toBeVisible()
    await expect(decoration).toBeVisible()

    // Modify the document to hide the decoration.
    await page.keyboard.press('a')
    await expect(decoration).not.toBeVisible()

    // Trigger/accept another completion, but don't expect the notification.
    await triggerInlineCompletionAfter(page, firstAcceptedCompletion)
    await acceptInlineCompletion(page)
    await expect(otherAcceptedCompletion).toBeVisible()
    await expect(decoration).not.toBeVisible()
    await expect.poll(() => loggedEvents).toEqual(expectedEvents)
})

async function triggerInlineCompletionAfter(page: Page, afterElement: Locator): Promise<void> {
    await afterElement.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await new Promise(resolve => setTimeout(resolve, 200))

    // Wait for ghost text to become visible.
    await page.locator('.ghost-text-decoration').waitFor({ state: 'visible' })
}

async function acceptInlineCompletion(page: Page): Promise<void> {
    await page.keyboard.press('Tab')
    await new Promise(resolve => setTimeout(resolve, 200))
}
