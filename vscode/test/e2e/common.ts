import { type Frame, type FrameLocator, type Locator, type Page, expect } from '@playwright/test'

import { SERVER_URL, VALID_TOKEN } from '../fixtures/mock-server'
import { executeCommandInPalette } from './helpers'

// Sign into Cody with valid auth from the sidebar
export const sidebarSignin = async (
    page: Page,
    sidebar: Frame | null,
    enableNotifications = false
): Promise<void> => {
    if (sidebar === null) {
        throw new Error('Sidebar is null, likely because preAuthenticate is `true`')
    }
    await sidebar.getByRole('button', { name: 'Sign In to Your Enterprise Instance' }).click()
    await page.getByRole('option', { name: 'Sign In with URL and Access Token' }).click()
    await page.getByRole('combobox', { name: 'input' }).fill(SERVER_URL)
    await page.getByRole('combobox', { name: 'input' }).press('Enter')
    await page.getByRole('combobox', { name: 'input' }).fill(VALID_TOKEN)
    await page.getByRole('combobox', { name: 'input' }).press('Enter')

    // Turn off notification
    if (!enableNotifications) {
        await disableNotifications(page)
    }

    await expectAuthenticated(page)
}

export async function expectAuthenticated(page: Page) {
    await expect(page.getByText('Chat alongside your code, attach files,')).toBeVisible()
}

// Selector for the Explorer button in the sidebar that would match on Mac and Linux
export const sidebarExplorer = (page: Page): Locator => page.getByRole('tab', { name: /Explorer.*/ })

/**
 * Use the command to toggle DND mode because the UI differs on Windows/non-Windows since 1.86 with
 * macOS appearing to use a native menu where Windows uses a VS Code-drawn menu.
 */
async function disableNotifications(page: Page): Promise<void> {
    await executeCommandInPalette(page, 'notifications: toggle do not disturb')
}

/**
 * Gets the chat panel frame locator.
 */
export function getChatPanel(page: Page): FrameLocator {
    return page.frameLocator('iframe.webview').frameLocator('iframe[title="New Chat"]')
}

/**
 * Create and open a new chat panel, and close the enhanced context settings window.
 * Returns the chat panel frame locator.
 */
export async function createEmptyChatPanel(
    page: Page
): Promise<[FrameLocator, Locator, Locator, Locator]> {
    await page.getByRole('button', { name: 'New Chat', exact: true }).click()
    const chatFrame = page.frameLocator('iframe.webview').last().frameLocator('iframe')
    const chatInputs = chatFrame.getByRole('textbox', { name: 'Chat message' })

    return [chatFrame, chatInputs.last(), chatInputs.first(), chatInputs]
}

export async function focusChatInputAtEnd(chatInput: Locator): Promise<void> {
    await chatInput.focus()
    await chatInput.press('End')
}

/**
 * Gets the chat context cell. If {@link counts} is specified, then validates that the context
 * exactly matches the specified file and line counts.
 */
export function getContextCell(
    chatPanel: FrameLocator,
    counts?: { files: number; lines: number }
): Locator {
    return chatPanel.locator('details', { hasText: 'Context' })
}

export async function expectContextCellCounts(
    contextCell: Locator,
    counts: { files: number; timeout?: number }
): Promise<void> {
    const summary = contextCell.locator('summary', { hasText: 'Context' })
    await expect(summary).toHaveAttribute(
        'title',
        `${counts.files} item${counts.files === 1 ? '' : 's'}`,
        { timeout: counts.timeout }
    )
}

export function atMentionMenuMessage(chatPanel: FrameLocator, text: string | RegExp): Locator {
    // Can't just use getByRole because the [cmdk-group-heading] is the aria-labelledby of the
    // [cmdk-group-items], which Playwright deems hidden when it is empty (because its height is 0),
    // but we still want to be able to get the label for testing even when the list below is empty.
    return chatPanel.locator(':is([cmdk-group-heading], [cmdk-empty])', { hasText: text })
}

export function chatInputMentions(chatInput: Locator): Locator {
    return chatInput.locator('.context-item-mention-node')
}

export async function openMentionsForProvider(
    frame: FrameLocator,
    chatInput: Locator,
    provider: string
): Promise<void> {
    await chatInput.press('@')
    await frame.getByRole('option', { name: provider }).click()
}

export function mentionMenuItems(chatFrame: FrameLocator): Locator {
    return chatFrame.locator('[cmdk-list] [role="option"]')
}

export async function selectMentionMenuItem(chatFrame: FrameLocator, title: string): Promise<void> {
    const item = chatFrame.locator('[cmdk-list] [role="option"]', { hasText: title })
    await item.click()
}

export async function openFileInEditorTab(page: Page, filename: string): Promise<void> {
    await sidebarExplorer(page).click()
    await page.getByRole('treeitem', { name: filename }).locator('a').dblclick()
    await clickEditorTab(page, filename)
}
export async function clickEditorTab(page: Page, title: string): Promise<void> {
    await page.getByRole('tab', { name: title }).click()
}

export async function selectLineRangeInEditorTab(
    page: Page,
    startLine: number,
    endLine: number
): Promise<void> {
    const lineNumbers = page.locator('div[class*="line-numbers"]')
    await lineNumbers.getByText(startLine.toString(), { exact: true }).click()
    await lineNumbers.getByText(endLine.toString(), { exact: true }).click({
        modifiers: ['Shift'],
    })
}
