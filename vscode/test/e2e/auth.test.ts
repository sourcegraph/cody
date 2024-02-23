import { expect } from '@playwright/test'

import { SERVER_URL, VALID_TOKEN } from '../fixtures/mock-server'

import { type ExpectedEvents, signOut, test } from './helpers'

test.extend<ExpectedEvents>({
    // list of events we expect this test to log, add to this list as needed
    expectedEvents: [
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
        'CodyVSCodeExtension:Auth:failed',
        'CodyVSCodeExtension:Auth:disconnected',
    ],
})('requires a valid auth token and allows logouts', async ({ page, sidebar }) => {
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

    // Click on Cody at the bottom menu to open the Cody Settings Menu and click on Sign In.
    await page.getByRole('button', { name: 'cody-logo-heavy, Sign In to Use Cody' }).click()
    await page
        .getByLabel('alert  Sign In to Use Cody, You need to sign in to use Cody., notice')
        .locator('a')
        .first()
        .click()
    // Makes sure the sign in page is loaded in the sidebar view with Cody: Chat as the heading
    // instead of the chat panel.
    await expect(page.getByRole('heading', { name: 'Cody: Chat' })).toBeVisible()
    await page.getByRole('heading', { name: 'Cody: Chat' }).click()
})
