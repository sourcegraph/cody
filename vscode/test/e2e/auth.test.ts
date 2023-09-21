import { expect } from '@playwright/test'

import { loggedEvents, SERVER_URL, VALID_TOKEN } from '../fixtures/mock-server'

import { signOut, test } from './helpers'

const expectedOrderedEvents = [
    'CodyInstalled',
    'CodyVSCodeExtension:Auth:failed',
    'CodyVSCodeExtension:auth:clickOtherSignInOptions',
    'CodyVSCodeExtension:login:clicked',
    'CodyVSCodeExtension:auth:selectSigninMenu',
    'CodyVSCodeExtension:auth:fromToken',
    'CodyVSCodeExtension:Auth:failed',
    'CodyVSCodeExtension:auth:clickOtherSignInOptions',
    'CodyVSCodeExtension:login:clicked',
    'CodyVSCodeExtension:auth:selectSigninMenu',
    'CodyVSCodeExtension:auth:fromToken',
    'CodyVSCodeExtension:Auth:connected',
    'CodyVSCodeExtension:logout:clicked',
    'CodyVSCodeExtension:Auth:disconnected',
]
test('requires a valid auth token and allows logouts', async ({ page, sidebar }) => {
    await expect(sidebar.getByText('Invalid credentials')).not.toBeVisible()
    await sidebar.getByRole('button', { name: 'Other Sign In Options…' }).click()
    await page.getByRole('option', { name: 'Sign in with URL and Access Token' }).click()
    await page.getByRole('combobox', { name: 'input' }).fill(SERVER_URL)
    await page.getByRole('combobox', { name: 'input' }).press('Enter')
    await page.getByRole('combobox', { name: 'input' }).fill('abcdefghijklmnopqrstuvwxyz')
    await page.getByRole('combobox', { name: 'input' }).press('Enter')

    await expect(sidebar.getByText('Invalid credentials')).toBeVisible()

    await sidebar.getByRole('button', { name: 'Other Sign In Options…' }).click()
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

    await expect(sidebar.getByRole('button', { name: 'Other Sign In Options…' })).toBeVisible()
    await expect(sidebar.getByText('Invalid credentials')).not.toBeVisible()
    expect(loggedEvents).toEqual(expectedOrderedEvents)
})
