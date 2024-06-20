import { expect } from '@playwright/test'
import { createEmptyChatPanel, getContextCell, selectMentionMenuItem, sidebarSignin } from './common'
import { test } from './helpers'

test('chat followup context', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)

    // Open chat.
    const [chatFrame, chatInput] = await createEmptyChatPanel(page)

    await chatInput.fill('@Main.java')
    await selectMentionMenuItem(chatFrame, 'Main.java')
    await chatInput.press('Enter')

    const contextCells = getContextCell(chatFrame)
    expect(contextCells).toHaveCount(1)
    expect(contextCells.first()).toHaveText(/Context/)

    // No additional context means no context cell.
    await chatInput.fill('followup1')
    await chatInput.press('Enter')
    expect(contextCells).toHaveCount(1)

    // Additional context means another context cell.
    await chatInput.fill('followup2 @var.go')
    await selectMentionMenuItem(chatFrame, 'var.go')
    await chatInput.press('Enter')
    expect(contextCells).toHaveCount(2)
    const lastContextCell = contextCells.last()
    expect(lastContextCell).toHaveText(/new item/)
    await lastContextCell.click() // expand
    expect(lastContextCell).toHaveText(/prior/i)
})
