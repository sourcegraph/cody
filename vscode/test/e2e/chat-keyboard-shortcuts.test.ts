import { expect } from '@playwright/test'
import {
    clickEditorTab,
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

    // Shift+Alt+L with no selection opens a new chat in an editor panel (with file mention).
    await openFileInEditorTab(page, 'buzz.ts')
    await clickEditorTab(page, 'buzz.ts')
    await page.keyboard.press('Shift+Alt+L')
    await expect(chatSidebarInput).toContainText('buzz.ts', { timeout: 3_000 })

    await executeCommandInPalette(page, 'View: Close Primary Sidebar')

    // Alt+L with a selection opens a new chat (with selection mention).
    await selectLineRangeInEditorTab(page, 3, 5)
    await page.keyboard.press('Alt+/')
    await expect(chatSidebarInput).toContainText('buzz.ts:3-5 ')
})
