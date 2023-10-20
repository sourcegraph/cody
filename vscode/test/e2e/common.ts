import { expect, Frame, Locator, Page } from '@playwright/test'

import { SERVER_URL, VALID_TOKEN } from '../fixtures/mock-server'

// Sign into Cody with valid auth from the sidebar
export const sidebarSignin = async (page: Page, sidebar: Frame): Promise<void> => {
    await sidebar.getByRole('button', { name: 'Other Sign In Options…' }).click()
    await page.getByRole('option', { name: 'Sign in with URL and Access Token' }).click()
    await page.getByRole('combobox', { name: 'input' }).fill(SERVER_URL)
    await page.getByRole('combobox', { name: 'input' }).press('Enter')
    await page.getByRole('combobox', { name: 'input' }).fill(VALID_TOKEN)
    await page.getByRole('combobox', { name: 'input' }).press('Enter')

    await expect(page.getByRole('button', { name: 'New Chat' })).toBeVisible()

    // if the clear notification is visible, click on it
    if (await page.getByRole('button', { name: /Clear Notification.*/ }).isVisible()) {
        await page.getByRole('button', { name: /Clear Notification.*/ }).click()
    }
}

// Selector for the Explorer button in the sidebar that would match on Mac and Linux
const sidebarExplorerRole = { name: /Explorer.*/ }
export const sidebarExplorer = (page: Page): Locator => page.getByRole('tab', sidebarExplorerRole)

// Selector for the Cody button in the sidebar
const sidebarCodyRole = { name: /Cody.*/ }
export const sidebarCody = (page: Page): Locator => page.getByRole('tab', sidebarCodyRole)

export const codyEditorCommandButtonRole = { name: /Commands.*/ }
