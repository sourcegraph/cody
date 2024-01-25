import { expect } from '@playwright/test'

import { loggedEvents, resetLoggedEvents, SERVER_URL, VALID_TOKEN } from '../fixtures/mock-server'

import { assertEvents, signOut, test } from './helpers'

// list of events we expect this test to log, add to this list as needed
const expectedEvents = [
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
    'CodyVSCodeExtension:Auth:failed',
    'CodyVSCodeExtension:Auth:disconnected',
]

test.beforeEach(() => {
    void resetLoggedEvents()
})

test('requires a valid auth token and allows logouts', async ({ page, sidebar }) => {
    await expect(page.getByText('Authentication failed.')).not.toBeVisible()
    await sidebar.getByRole('button', { name: 'Sign In to Your Enterprise Instance' }).click()
    await page.getByRole('option', { name: 'Sign In with URL and Access Token' }).click()
    await page.getByRole('combobox', { name: 'input' }).fill(SERVER_URL)
    await page.getByRole('combobox', { name: 'input' }).press('Enter')
    await page.getByRole('combobox', { name: 'input' }).fill('abcdefghijklmnopqrstuvwxyz')
    await page.getByRole('combobox', { name: 'input' }).press('Enter')

    await expect(page.getByRole('alert').getByText('Authentication failed.')).toBeVisible()

    await sidebar.getByRole('button', { name: 'Sign In to Your Enterprise Instance' }).click()
    await page.getByRole('option', { name: 'Sign In with URL and Access Token' }).click()
    await page.getByRole('combobox', { name: 'input' }).fill(SERVER_URL)
    await page.getByRole('combobox', { name: 'input' }).press('Enter')
    await page.getByRole('combobox', { name: 'input' }).fill(VALID_TOKEN)
    await page.getByRole('combobox', { name: 'input' }).press('Enter')

    // Sign out.
    await signOut(page)

    const sidebarFrame = page.frameLocator('iframe.webview').frameLocator('iframe').first()
    await expect(
        sidebarFrame.getByRole('button', { name: 'Sign In to Your Enterprise Instance' })
    ).toBeVisible()

    // Critical test to prevent event logging regressions.
    // Do not remove without consulting data analytics team.
    await assertEvents(loggedEvents, expectedEvents)
})
