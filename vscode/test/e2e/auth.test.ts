import { expect } from '@playwright/test'

import { loggedEvents, resetLoggedEvents, SERVER_URL, VALID_TOKEN } from '../fixtures/mock-server'

import { assertEvents, signOut, test } from './helpers'

const expectedEvents = ['CodyVSCodeExtension:logout:clicked']

test.beforeEach(() => {
    void resetLoggedEvents()
})

test('requires a valid auth token and allows logouts', async ({ page, sidebar }) => {
    await expect(page.getByText('Authentication failed.')).not.toBeVisible()
    await sidebar.getByRole('button', { name: 'Sign In to Your Enterprise Instance' }).click()
    await page.getByRole('option', { name: 'Sign in with URL and Access Token' }).click()
    await page.getByRole('combobox', { name: 'input' }).fill(SERVER_URL)
    await page.getByRole('combobox', { name: 'input' }).press('Enter')
    await page.getByRole('combobox', { name: 'input' }).fill('abcdefghijklmnopqrstuvwxyz')
    await page.getByRole('combobox', { name: 'input' }).press('Enter')

    await expect(page.getByRole('alert').getByText('Authentication failed.')).toBeVisible()

    await sidebar.getByRole('button', { name: 'Sign In to Your Enterprise Instance' }).click()
    await page.getByRole('option', { name: 'Sign in with URL and Access Token' }).click()
    await page.getByRole('combobox', { name: 'input' }).fill(SERVER_URL)
    await page.getByRole('combobox', { name: 'input' }).press('Enter')
    await page.getByRole('combobox', { name: 'input' }).fill(VALID_TOKEN)
    await page.getByRole('combobox', { name: 'input' }).press('Enter')

    // Collapse the task tree view
    await page.getByRole('button', { name: 'Fixups Section' }).click()

    await expect(sidebar.getByText("Hello! I'm Cody.")).toBeVisible()

    // Check if embeddings server connection error is visible
    await expect(sidebar.getByText('Error while establishing embeddings server connection.')).not.toBeVisible()

    // Sign out.
    await signOut(page)

    await expect(sidebar.getByRole('button', { name: 'Sign In to Your Enterprise Instance' })).toBeVisible()
    await expect(sidebar.getByText('Invalid credentials')).not.toBeVisible()
    await assertEvents(loggedEvents, expectedEvents)
})
