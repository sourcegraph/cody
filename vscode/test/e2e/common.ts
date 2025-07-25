import { type Frame, type FrameLocator, type Locator, type Page, expect } from '@playwright/test'

import { SERVER_URL, VALID_TOKEN } from '../fixtures/mock-server'
import { executeCommandInPalette } from './helpers'

interface SidebarSigninOptions {
    enableNotifications: boolean
    skipAssertions: boolean
}

// Sign into Cody with valid auth from the sidebar
export const sidebarSignin = async (
    page: Page,
    sidebar: Frame | null,
    options: Partial<SidebarSigninOptions> = {}
): Promise<void> => {
    if (sidebar === null) {
        throw new Error('Sidebar is null, likely because preAuthenticate is `true`')
    }
    await focusSidebar(page)

    await sidebar.getByText('Sourcegraph Instance URL').click()
    await sidebar.getByPlaceholder('Example: https://instance.').click()
    await sidebar.getByPlaceholder('Example: https://instance.').fill(SERVER_URL)

    await sidebar.getByText('Access Token (Optional)').click()
    await sidebar.getByPlaceholder('Access token...').fill(VALID_TOKEN)
    await sidebar.getByPlaceholder('Access token...').press('Enter')

    // Turn off notification
    if (!options.enableNotifications) {
        await disableNotifications(page)
    }

    if (!options.skipAssertions) {
        await expectAuthenticated(page)
    }

    // Wait very briefly to let the authStatus changes propagate.
    await page.waitForTimeout(500)
}

export async function closeSidebar(page: Page): Promise<void> {
    if (await isSidebarVisible(page)) {
        await page.click('[aria-label="Cody"]')
    }
}

async function isSidebarVisible(page: Page): Promise<boolean> {
    const sidebarsVisible = await Promise.all([
        page.getByRole('heading', { name: 'Cody: Chat' }).isVisible({ timeout: 1 }),
        page.getByRole('heading', { name: 'Cody' }).isVisible({ timeout: 1 }),
    ])
    return sidebarsVisible[0] || sidebarsVisible[1]
}

export async function focusSidebar(page: Page): Promise<void> {
    // In case the cody sidebar isn't focused, select it.
    while (!(await isSidebarVisible(page))) {
        await page.click('[aria-label="Cody"]')
    }
}

export async function expectAuthenticated(page: Page) {
    await focusSidebar(page)
    // Expect the sign in button to be gone.
    await expect(page.getByLabel('Sign in to Sourcegraph')).not.toBeVisible()
}

export async function expectSignInPage(page: Page) {
    await focusSidebar(page)
    // Makes sure the sign in page is loaded in the sidebar view with Cody: Chat as the heading
    // instead of the chat panel.
    const sidebarFrame = getChatSidebarPanel(page)
    await expect(sidebarFrame.getByText('Sign in to Sourcegraph')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Cody: Chat' })).toBeVisible()
    // Expect status bar to show the sign in button.
    await expect(page.getByRole('button', { name: /cody-logo-heavy Sign In/ })).toBeVisible()
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
 * Returns the sidebar chat panel frame locator.
 */
export function getChatSidebarPanel(page: Page): FrameLocator {
    return page.frameLocator('iframe.webview:first-child:last-child').frameLocator('iframe')
}

/**
 * Gets the chat panel frame locator.
 */
export function getChatEditorPanel(page: Page): FrameLocator {
    return page.frameLocator('.simple-find-part-wrapper + iframe.webview').last().frameLocator('iframe')
}

/**
 * Create and open a new chat panel. Returns the chat panel frame locator.
 */
export async function createEmptyChatPanel(
    page: Page
): Promise<[FrameLocator, Locator, Locator, Locator]> {
    await executeCommandInPalette(page, 'Cody: New Chat in Editor')

    // .simple-find-part-wrapper helps select for the webview in the panel rather than the sidebar
    const chatFrame = getChatEditorPanel(page)

    const chatInputs = chatFrame.getByRole('textbox', { name: 'Chat message' })

    return [chatFrame, chatInputs.last(), chatInputs.first(), chatInputs]
}

export function getChatInputs(chatPanel: FrameLocator): Locator {
    return chatPanel.getByRole('textbox', { name: 'Chat message' })
}

export async function focusChatInputAtEnd(chatInput: Locator): Promise<void> {
    await chatInput.focus()
    await chatInput.press('End')
}

export function chatMessageRows(chatPanel: FrameLocator): Locator {
    return chatPanel.locator('[role="row"]')
}

/**
 * Gets the chat context cell.
 */
export function getContextCell(chatPanel: FrameLocator): Locator {
    return chatPanel.locator('[data-testid="context"]', { hasText: 'Context' })
}

export async function openContextCell(contextCell: Locator) {
    const contextButton = contextCell.locator('button', { hasText: 'Context' })
    await contextButton.hover()
    await contextButton.click()
}

export async function expectContextCellCounts(
    contextCell: Locator,
    counts: { files: number; timeout?: number }
): Promise<void> {
    const summary = contextCell.locator('button', { hasText: 'Context' })
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
    provider: string,
    exact?: boolean
): Promise<void> {
    await chatInput.pressSequentially('@', { delay: 350 })
    await frame.getByRole('option', { name: provider, exact }).click()
}

export function mentionMenu(chatFrame: FrameLocator): Locator {
    return chatFrame.locator('[cmdk-root][data-testid="mention-menu"]')
}

export function mentionMenuItems(chatFrame: FrameLocator): Locator {
    return chatFrame.locator('[cmdk-root][data-testid="mention-menu"] [role="option"]')
}

export async function selectMentionMenuItem(chatFrame: FrameLocator, title: string): Promise<void> {
    const item = chatFrame.locator('[cmdk-root][data-testid="mention-menu"] [role="option"]', {
        hasText: title,
    })
    await item.click()
}

export async function openFileInEditorTab(page: Page, filename: string): Promise<void> {
    await page.keyboard.press('F1')
    // Without the leading `>`, the input is interpreted as a filename.
    await page.getByPlaceholder('Type the name of a command to run.').fill(filename)
    // In multi-root workspaces, the accessible name includes workspace folder info
    // e.g., "buzz.ts workspace, file results" instead of just "buzz.ts,"
    // So we use a more flexible pattern that matches the filename at the start
    await expect(
        page
            .getByRole('listbox', { name: /^Search files/ })
            .getByRole('option')
            .first()
    ).toHaveAccessibleName(new RegExp(`^${filename}\\b`))
    await page.keyboard.press('Enter')

    await clickEditorTab(page, filename)
}

export async function clickEditorTab(
    page: Page,
    title: string,
    options: Partial<Parameters<Page['getByRole']>[1]> = {}
): Promise<void> {
    await page
        .getByRole('tab', { ...options, name: title })
        .first()
        .click()
}

export async function selectLineRangeInEditorTab(
    page: Page,
    startLine: number,
    endLine?: number
): Promise<void> {
    const lineNumbers = page.locator('div[class*="line-numbers"]')
    await lineNumbers.getByText(startLine.toString(), { exact: true }).last().click()
    if (typeof endLine !== 'undefined') {
        await lineNumbers
            .getByText(endLine.toString(), { exact: true })
            .last()
            .click({
                modifiers: ['Shift'],
            })
    }
}
