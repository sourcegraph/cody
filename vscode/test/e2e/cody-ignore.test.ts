import path from 'path'
import { expect } from '@playwright/test'
import { sidebarExplorer, sidebarSignin } from './common'
import { type ExpectedEvents, test } from './helpers'

/**
 * NOTE: .cody/ignore current supports behind 'cody.internal.unstable' flag
 *
 * End-to-end test for Cody behavior when files are ignored.
 *
 * Tests that Cody commands and chat do not work on ignored files,
 * and ignored files are not included in chat context.
 */
test.extend<ExpectedEvents>({
    // list of events we expect this test to log, add to this list as needed
    expectEvents: [
        'CodyInstalled',
        'CodyVSCodeExtension:Auth:failed',
        'CodyVSCodeExtension:auth:clickOtherSignInOptions',
        'CodyVSCodeExtension:login:clicked',
        'CodyVSCodeExtension:auth:selectSigninMenu',
        'CodyVSCodeExtension:auth:fromToken',
        'CodyVSCodeExtension:Auth:connected',
        'CodyVSCodeExtension:chat-question:submitted',
        'CodyVSCodeExtension:chat-question:executed',
        'CodyVSCodeExtension:command:explain:clicked',
        'CodyVSCodeExtension:command:explain:executed',
    ],
})('chat and command do not work in .cody/ignore file', async ({ page, sidebar }) => {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Open the file that is on the .cody/ignore list from the tree view
    await sidebarExplorer(page).click()
    await page.getByRole('treeitem', { name: 'ignoredByCody.css' }).locator('a').dblclick()
    await page.getByRole('tab', { name: 'ignoredByCody.css' }).hover()

    // Cody icon in the status bar should shows that the file is being ignored
    const statusBarButton = page.getByRole('button', {
        name: 'cody-logo-heavy, Current file is ignored by Cody',
    })
    await statusBarButton.hover()
    await expect(statusBarButton).toBeVisible()

    await page.click('.badge[aria-label="Cody"]')

    // Start new chat
    await page.getByRole('button', { name: 'New Chat', exact: true }).click()

    /* TEST: Chat Context - Ignored file do not show up with context */
    const chatPanel = page.frameLocator('iframe.webview').last().frameLocator('iframe')
    const chatInput = chatPanel.getByRole('textbox', { name: 'Chat message' })
    await chatInput.focus()
    await chatInput.fill('Ignore me')
    await chatInput.press('Enter')
    // Assistant should response to your chat question,
    // but the current file is excluded (ignoredByCody.css) and not on the context list
    await expect(chatPanel.getByText('hello from the assistant')).toBeVisible()
    expect(await chatPanel.getByText(/^✨ Context:/).count()).toEqual(0)

    /* TEST: At-file - Ignored file does not show up as context when using @-mention */
    await chatInput.focus()
    await chatInput.clear()
    await chatInput.fill('@ignoredByCody')
    await expect(chatPanel.getByRole('heading', { name: 'No matching files found' })).toBeVisible()
    await chatInput.clear()
    await chatInput.fill('@ignore')
    await expect(
        chatPanel.getByRole('button', { name: withPlatformSlashes('.cody/ignore') })
    ).toBeVisible()
    await expect(chatPanel.getByRole('button', { name: 'ignoredByCody.css' })).not.toBeVisible()

    /* TEST: Command - Ignored file do not show up with context */
    await page.getByText('Explain Code').hover()
    await page.getByText('Explain Code').click()
    // Assistant should not response to your command, so you should still see the old message.
    await expect(chatPanel.getByText('Ignore me')).toBeVisible()
    // A system message shows up to notify users that the file is ignored
    await expect(page.getByText(/^Cannot execute a command in an ignored file./)).toBeVisible()
})

function withPlatformSlashes(input: string) {
    return input.replaceAll(path.posix.sep, path.sep)
}
