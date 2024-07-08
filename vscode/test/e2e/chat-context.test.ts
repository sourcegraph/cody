import { expect } from '@playwright/test'
import {
    createEmptyChatPanel,
    getContextCell,
    openContextCell,
    selectMentionMenuItem,
    sidebarSignin,
} from './common'
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
    await openContextCell(contextCells.first())
    await expect(contextCells.first()).toHaveText(/Main\.java/)

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
    expect(lastContextCell).toHaveText(/1 new item/)
    await openContextCell(lastContextCell)
    await expect(lastContextCell).toHaveText(/var\.go/)
    await expect(lastContextCell).toHaveText(/Prior messages/)
})
