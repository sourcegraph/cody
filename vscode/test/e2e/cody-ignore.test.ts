import path from 'node:path'
import { expect } from '@playwright/test'
import {
    atMentionMenuMessage,
    createEmptyChatPanel,
    getContextCell,
    sidebarExplorer,
    sidebarSignin,
} from './common'
import { type ExpectedV2Events, executeCommandInPalette, test } from './helpers'

/**
 * NOTE: .cody/ignore current supports behind 'cody.internal.unstable' flag
 *
 * End-to-end test for Cody behavior when files are ignored.
 *
 * Tests that Cody commands and chat do not work on ignored files,
 * and ignored files are not included in chat context.
 */
test.extend<ExpectedV2Events>({
    // list of events we expect this test to log, add to this list as needed
    expectedV2Events: [
        'cody.extension:installed',
        'cody.codyIgnore:hasFile',
        'cody.auth.login:clicked',
        'cody.auth.signin.menu:clicked',
        'cody.auth.login:firstEver',
        'cody.auth.signin.token:clicked',
        'cody.auth:connected',
        'cody.chat-question:submitted',
        'cody.chat-question:executed',
        'cody.chatResponse:noCode',
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
        name: 'cody-logo-heavy-slash File Ignored, The current file is ignored by Cody',
    })
    await statusBarButton.hover()
    await expect(statusBarButton).toBeVisible()

    await page.getByRole('tab', { name: 'Cody', exact: true }).locator('a').click()

    // Start new chat
    const [chatPanel, chatInput] = await createEmptyChatPanel(page)

    /* TEST: Chat Context - Ignored file do not show up with context */
    await chatInput.focus()
    await chatInput.fill('Ignore me')
    await chatInput.press('Enter')
    // Assistant should response to your chat question,
    // but the current file is excluded (ignoredByCody.css) and not on the context list
    await expect(chatPanel.getByText('hello from the assistant')).toBeVisible()
    const contextCell = getContextCell(chatPanel)
    await expect(contextCell).not.toBeVisible()

    /* TEST: At-file - Ignored file does not show up as context when using @-mention */
    await chatInput.focus()
    await chatInput.clear()
    await chatInput.fill('@ignoredByCody')
    await expect(atMentionMenuMessage(chatPanel, 'No files found')).toBeVisible()
    await chatInput.clear()
    await chatInput.fill('@ignore')
    await expect(
        chatPanel.getByRole('option', { name: withPlatformSlashes('ignore .cody') })
    ).toBeVisible()
    await expect(chatPanel.getByRole('option', { name: 'ignoredByCody.css' })).not.toBeVisible()

    /* TEST: Command - Ignored file do not show up with context */
    await executeCommandInPalette(page, 'Cody Command: Explain Code')
    // Assistant should not response to your command, so you should still see the old message.
    await expect(chatPanel.getByText('Ignore me')).toBeVisible()
    // A system message shows up to notify users that the file is ignored
    await expect(
        page.getByText(/^Command failed to run: file is ignored \(due to your cody ignore config\)/)
    ).toBeVisible()
})

function withPlatformSlashes(input: string) {
    return input.replaceAll(path.posix.sep, path.sep)
}
