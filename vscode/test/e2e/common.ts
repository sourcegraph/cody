import { type Frame, type FrameLocator, type Locator, type Page, expect } from '@playwright/test'

import { SERVER_URL, VALID_TOKEN } from '../fixtures/mock-server'
import { executeCommandInPalette } from './helpers'

// Sign into Cody with valid auth from the sidebar
export const sidebarSignin = async (
    page: Page,
    sidebar: Frame,
    enableNotifications = false
): Promise<void> => {
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
export async function createEmptyChatPanel(page: Page): Promise<[FrameLocator, Locator]> {
    await page.getByRole('button', { name: 'New Chat', exact: true }).click()
    const chatFrame = page.frameLocator('iframe.webview').last().frameLocator('iframe')
    const enhancedContextCheckbox = chatFrame.locator('#enhanced-context-checkbox')
    await expect(enhancedContextCheckbox).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(enhancedContextCheckbox).not.toBeVisible()
    const chatInput = chatFrame.getByRole('textbox', { name: 'Chat message' })
    return [chatFrame, chatInput]
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
    counts: { files: number; lines?: number; timeout?: number }
): Promise<void> {
    const summary = contextCell.locator('summary', { hasText: 'Context' })
    await expect(summary).toHaveAttribute(
        'title',
        `${
            counts.lines !== undefined
                ? `${counts.lines} line${counts.lines === 1 ? '' : 's'} from `
                : ''
        }${counts.files} file${counts.files === 1 ? '' : 's'}`,
        { timeout: counts.timeout }
    )
}
