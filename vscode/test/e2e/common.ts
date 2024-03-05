import { type Frame, type Locator, type Page, expect } from '@playwright/test'

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
const sidebarExplorerRole = { name: /Explorer.*/ }
export const sidebarExplorer = (page: Page): Locator => page.getByRole('tab', sidebarExplorerRole)

async function disableNotifications(page: Page): Promise<void> {
    // Use the command to toggle DND mode because the UI differs on Windows/non-Windows since 1.86 with
    // macOS appearing to use a native menu where Windows uses a VS Code-drawn menu.
    await executeCommandInPalette(page, 'notifications: toggle do not disturb')
}
