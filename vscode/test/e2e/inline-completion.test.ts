import { expect, Page } from '@playwright/test'

import { loggedEvents, resetLoggedEvents } from '../fixtures/mock-server'

import { sidebarExplorer, sidebarSignin } from './common'
import { test } from './helpers'

test.beforeEach(() => {
    resetLoggedEvents()
})
test('shows chat sidebar completion onboarding notice on first completion accept', async ({ page, sidebar }) => {
    const expectedOrderedEvents = [
        'CodyVSCodeExtension:completion:suggested',
        'CodyVSCodeExtension:completion:accepted',
        'CodyVSCodeExtension:completion:suggested',
    ]

    const indexFile = page.getByRole('treeitem', { name: 'index.html' }).locator('a')
    const editor = page.locator('[id="workbench\\.parts\\.editor"]')
    const notice = sidebar.locator('.onboarding-autocomplete')
    const noticeCloseButton = notice.locator('div[class^="_notice-close"] vscode-button')

    const firstAcceptedCompletion = editor.getByText('myFirstCompletion')
    const otherAcceptedCompletion = editor.getByText('myNotFirstCompletion')

    // Sign into Cody.
    await sidebarSignin(page, sidebar)

    // Open the index.html file from explorer.
    await sidebarExplorer(page).click()
    await indexFile.dblclick()

    // Trigger inline-completion and ensure no notice (yet).
    await triggerInlineCompletionInBody(page)
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
    await triggerInlineCompletionInBody(page)
    await acceptInlineCompletion(page)
    await expect(otherAcceptedCompletion).toBeVisible()
    await expect(notice).not.toBeVisible()
    await expect.poll(() => loggedEvents.sort()).toEqual(expectedOrderedEvents.sort())
})

test('inline completion onboarding notice on first completion accept', async ({ page, sidebar }) => {
    const expectedOrderedEvents = [
        'CodyVSCodeExtension:completion:suggested',
        'CodyVSCodeExtension:completion:accepted',
        'CodyVSCodeExtension:completion:suggested', // Extra trigger from pressing 'a' to test hiding.
        'CodyVSCodeExtension:completion:suggested',
    ]

    const indexFile = page.getByRole('treeitem', { name: 'index.html' }).locator('a')
    const editor = page.locator('[id="workbench\\.parts\\.editor"]')
    // The text in the decoration is part of the CSS rule (it's in :after) so we can't locate it
    // directly, we just have to assume this is the only decoration in the editor during this test.
    // If that assumption ceases to be the case, this test will fail on the initial check that it's
    // not visible.
    const decoration = editor.locator('css=span[class*="TextEditorDecorationType"]')

    const firstAcceptedCompletion = editor.getByText('myFirstCompletion')
    const otherAcceptedCompletion = editor.getByText('myNotFirstCompletion')

    // Sign into Cody.
    await sidebarSignin(page, sidebar)

    // Open the index.html file from explorer.
    await sidebarExplorer(page).click()
    await indexFile.dblclick()

    // Trigger inline-completion and ensure no notice (yet).
    await triggerInlineCompletionInBody(page)
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
    await triggerInlineCompletionInBody(page)
    await acceptInlineCompletion(page)
    await expect(otherAcceptedCompletion).toBeVisible()
    await expect(decoration).not.toBeVisible()
    await expect.poll(() => loggedEvents.sort()).toEqual(expectedOrderedEvents.sort())
})

async function triggerInlineCompletionInBody(page: Page): Promise<void> {
    await page.getByText('<body>').click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await new Promise(resolve => setTimeout(resolve, 200))
}

async function acceptInlineCompletion(page: Page): Promise<void> {
    await page.keyboard.press('Tab')
    await new Promise(resolve => setTimeout(resolve, 200))
}
