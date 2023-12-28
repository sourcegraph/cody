import { expect, Locator, Page } from '@playwright/test'

import { loggedEvents, resetLoggedEvents } from '../fixtures/mock-server'

import { sidebarExplorer, sidebarSignin } from './common'
import { assertEvents, test } from './helpers'

test.beforeEach(() => {
    resetLoggedEvents()
})

// TODO Fix flaky test
test.skip('shows chat sidebar completion onboarding notice on first completion accept', async ({ page, sidebar }) => {
    const expectedEvents = [
        // First suggest/accept
        'CodyVSCodeExtension:completion:suggested',
        'CodyVSCodeExtension:completion:accepted',
        // Second suggest/accept
        'CodyVSCodeExtension:completion:suggested',
        'CodyVSCodeExtension:completion:accepted',
    ]

    const indexFile = page.getByRole('treeitem', { name: 'index.html' }).locator('a')
    const editor = page.locator('[id="workbench\\.parts\\.editor"]')
    const notice = page.locator('.onboarding-autocomplete')
    const chatPanelFrame = page.frameLocator('iframe.webview').last().frameLocator('iframe')
    const noticeCloseButton = chatPanelFrame.locator('div[class^="_notice-close"] vscode-button').nth(1)

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
    await triggerInlineCompletionAfter(page, page.getByText('<body>'), 'myFirst')
    await expect(notice).not.toBeVisible()

    // Accept the completion and expect the text to be added and
    // the notice to be shown.
    await acceptInlineCompletion(page)
    await expect(firstAcceptedCompletion).toBeVisible()
    await expect(chatPanelFrame.locator('.onboarding-autocomplete')).toBeVisible()

    // Close the notice.
    await noticeCloseButton.click()
    await expect(notice).not.toBeVisible()

    // Trigger/accept another completion, but don't expect the notification.
    await triggerInlineCompletionAfter(page, firstAcceptedCompletion, 'myNot')
    await acceptInlineCompletion(page)
    await expect(otherAcceptedCompletion).toBeVisible()
    await expect(notice).not.toBeVisible()
    await assertEvents(loggedEvents, expectedEvents)
})

test.skip('inline completion onboarding notice on first completion accept', async ({ page, sidebar }) => {
    const expectedEvents = [
        // First suggest/accept
        'CodyVSCodeExtension:completion:suggested',
        'CodyVSCodeExtension:completion:accepted',
        // Second suggest/accept
        'CodyVSCodeExtension:completion:suggested',
        'CodyVSCodeExtension:completion:accepted',
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
    await triggerInlineCompletionAfter(page, page.getByText('<body>'), 'myFirst')
    await expect(decoration).not.toBeVisible()

    // Accept the completion and expect the text to be added and
    // the notice to be shown.
    await acceptInlineCompletion(page)
    await expect(firstAcceptedCompletion).toBeVisible()
    await expect(decoration).toBeVisible()

    await page.getByRole('tab', { name: 'index.html' }).getByText('index.html').click()

    // Modify the document to hide the decoration.
    await page.keyboard.press('a')
    await expect(page.locator('css=span[class*="TextEditorDecorationType"]')).not.toBeVisible()

    // Trigger/accept another completion, but don't expect the notification.
    await page.waitForTimeout(100)
    await triggerInlineCompletionAfter(page, firstAcceptedCompletion, 'myNot')
    await acceptInlineCompletion(page)
    // After accepting a completion, a new completion request will be made. Since this can interfere
    // with the expected event order (especially since suggestion events are logged after the
    // completion is hidden), we type a semicolon which will prevent an automatic completion from
    // showing up
    await page.keyboard.press(';')
    await expect(otherAcceptedCompletion).toBeVisible()
    await expect(decoration).not.toBeVisible()

    await assertEvents(loggedEvents, expectedEvents)
})

async function triggerInlineCompletionAfter(page: Page, afterElement: Locator, prefix: string): Promise<void> {
    await afterElement.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type(prefix)

    // TODO: Fix flaky
    // Wait for ghost text to become visible.
    await page.locator('.ghost-text-decoration').waitFor({ state: 'visible' })
}

async function acceptInlineCompletion(page: Page): Promise<void> {
    await page.keyboard.press('Tab')
    await page.waitForTimeout(100)
}
