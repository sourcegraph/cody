import { expect } from '@playwright/test'
import {
    chatMessageRows,
    clickEditorTab,
    getChatInputs,
    getChatSidebarPanel,
    openFileInEditorTab,
    selectLineRangeInEditorTab,
    sidebarSignin,
} from './common'
import { executeCommandInPalette, test } from './helpers'

test('chat keyboard shortcuts', async ({ page, sidebar }) => {
    await page.bringToFront()
    await sidebarSignin(page, sidebar)

    // Collapse Settings section to make room for chat components
    await page.getByLabel('Settings & Support Section').click()

    const chatPanel = getChatSidebarPanel(page)
    const chatInput = getChatInputs(chatPanel).first()

    // Alt+L with no selection opens a new chat (with file mention).
    await openFileInEditorTab(page, 'buzz.ts')
    await page.keyboard.press('Alt+L')
    await expect(chatInput).toContainText('buzz.ts', { timeout: 3_000 })

    await executeCommandInPalette(page, 'View: Close Primary Sidebar')

    // Alt+L with a selection opens a new chat (with selection mention).
    await openFileInEditorTab(page, 'buzz.ts')
    await selectLineRangeInEditorTab(page, 3, 5)
    await page.keyboard.press('Alt+L')
    await expect(chatInput).toContainText('buzz.ts:3-5 ')

    // Alt+L with an existing chat appends a selection mention.
    await chatInput.press('x')
    await clickEditorTab(page, 'buzz.ts')
    await selectLineRangeInEditorTab(page, 7, 9)
    await page.keyboard.press('Alt+L')
    await expect(chatInput).toContainText('buzz.ts:3-5 x buzz.ts:7-9 ')

    // Alt+L in the chat (after sending) opens a new chat.
    await chatInput.press('Enter')
    await expect(chatMessageRows(chatPanel).nth(2)).toContainText(/hello from the assistant/)
})
