import { expect } from '@playwright/test'
import {
    chatInputMentions,
    clickEditorTab,
    createEmptyChatPanel,
    getChatInputs,
    getChatSidebarPanel,
    openFileInEditorTab,
    selectLineRangeInEditorTab,
    sidebarSignin,
} from './common'
import { executeCommandInPalette, test } from './helpers'

test('chat keyboard shortcuts for sidebar chat', async ({ page, sidebar }) => {
    await page.bringToFront()
    await sidebarSignin(page, sidebar)

    const chatSidebar = getChatSidebarPanel(page)
    const chatSidebarInput = getChatInputs(chatSidebar).first()

    // Ctrl+Alt+L with no selection opens a new chat in an editor panel (with file mention).
    await openFileInEditorTab(page, 'buzz.ts')
    await clickEditorTab(page, 'buzz.ts')
    await page.keyboard.press('Shift+Control+l')
    await expect(chatSidebarInput).toContainText('buzz.ts', { timeout: 3_000 })

    await executeCommandInPalette(page, 'View: Close Primary Sidebar')

    // Shift+Alt+L with a selection opens a new chat (with selection mention).
    await selectLineRangeInEditorTab(page, 3, 5)
    await page.keyboard.press('Shift+Alt+/')
    await expect(chatSidebarInput).toContainText('buzz.ts:3-5 ')
})

test('re-opening chat adds selection', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)

    await openFileInEditorTab(page, 'buzz.ts')

    const [, lastChatInput] = await createEmptyChatPanel(page)
    await lastChatInput.fill('Hello')
    await lastChatInput.press('Enter')

    await clickEditorTab(page, 'buzz.ts')
    await selectLineRangeInEditorTab(page, 2, 4)
    await page.keyboard.press('Shift+Alt+l')
    await expect(chatInputMentions(lastChatInput)).toHaveText(/^buzz.ts:2-4$/)

    // Re-opening chat does not add duplicate selection
    await openFileInEditorTab(page, 'buzz.ts')
    await selectLineRangeInEditorTab(page, 2, 4)
    await page.keyboard.press('Shift+Alt+l')
    await expect(chatInputMentions(lastChatInput)).toHaveText(/^buzz.ts:2-4$/)
})
