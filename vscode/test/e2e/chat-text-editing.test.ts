import { expect } from '@playwright/test'

import { sidebarSignin } from './common'
import { test } from './helpers'

test('editing messages in the chat input', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)

    await page.getByRole('button', { name: 'New Chat', exact: true }).click()

    const chatFrame = page.frameLocator('iframe.webview').last().frameLocator('iframe')
    const chatInput = chatFrame.getByRole('textbox', { name: 'Chat message' })

    // Test that Ctrl+Arrow jumps by a word.
    await chatInput.clear()
    await chatInput.type('One')
    await chatInput.press('Control+ArrowLeft')
    await chatInput.type('Two')
    await expect(chatInput).toHaveValue('TwoOne')

    // Test that Ctrl+Shift+Arrow highlights a word by trying to delete it.
    await chatInput.clear()
    await chatInput.type('One')
    await chatInput.press('Control+Shift+ArrowLeft')
    await chatInput.press('Delete')
    await expect(chatInput).toHaveValue('')
})
