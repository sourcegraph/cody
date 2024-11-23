import { expect } from '@playwright/test'
import { SERVER_URL, VALID_TOKEN } from '../fixtures/mock-server'
import { focusSidebar } from './common'
import { getChatSidebarPanel } from './common'
import { type DotcomUrlOverride, type ExpectedV2Events, signOut, test } from './helpers'
test.extend<ExpectedV2Events>({
    // list of V2 telemetry events we expect this test to log, add to this list as needed
    expectedV2Events: [
        'cody.extension:installed',
        'cody.auth.login:clicked',
        'cody.auth.signin.menu:clicked',
        'cody.auth.signin.token:clicked',
        'cody.auth:connected',
        'cody.signInNotification:shown',
        'cody.auth:failed',
        'cody.auth.login:firstEver',
        'cody.auth:disconnected',
        'cody.interactiveTutorial:attemptingStart',
        'cody.experiment.interactiveTutorial:enrolled',
    ],
})('requires a valid auth token and allows logouts', async ({ page, sidebar, nap }) => {
    await expect(page.getByText('Authentication failed.')).not.toBeVisible()
    await sidebar?.getByRole('button', { name: 'Sign In to Your Enterprise Instance' }).click()
    await page.getByRole('option', { name: 'Sign In with URL and Access Token' }).click()
    await page.getByRole('combobox', { name: 'input' }).fill(SERVER_URL)
    await page.getByRole('combobox', { name: 'input' }).press('Enter')
    await page.getByRole('combobox', { name: 'input' }).fill('abcdefghijklmnopqrstuvwxyz')
    await page.getByRole('combobox', { name: 'input' }).press('Enter')

    await expect(page.getByRole('alert').getByText('Authentication failed.')).toBeVisible()

    await sidebar?.getByRole('button', { name: 'Sign In to Your Enterprise Instance' }).click()
    await page.getByRole('option', { name: 'Sign In with URL and Access Token' }).click()
    await page.getByRole('combobox', { name: 'input' }).fill(SERVER_URL)
    await page.getByRole('combobox', { name: 'input' }).press('Enter')
    await page.getByRole('combobox', { name: 'input' }).fill(VALID_TOKEN)
    await page.getByRole('combobox', { name: 'input' }).press('Enter')
    // Sign out.
    await signOut(page)
    await focusSidebar(page)

    // Makes sure the sign in page is loaded in the sidebar view with Cody: Chat as the heading
    // instead of the chat panel.
    const sidebarFrame = getChatSidebarPanel(page)
    await expect(
        sidebarFrame.getByRole('button', { name: 'Sign In to Your Enterprise Instance' })
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Cody: Chat' })).toBeVisible()

    // Expect status bar to show the sign in button.
    await expect(page.getByRole('button', { name: 'cody-logo-heavy Sign In, Sign' })).toBeVisible()
})

// When an enterprise customer is logged in to a dotcom url, they should be logged out immediately
test
    .extend<DotcomUrlOverride>({
        dotcomUrl: SERVER_URL,
    })
    .extend<ExpectedV2Events>({
        // list of V2 telemetry events we expect this test to log, add to this list as needed
        expectedV2Events: [
            'cody.extension:installed',
            'cody.auth.login:clicked',
            'cody.auth.signin.menu:clicked',
            'cody.auth.signin.token:clicked',
            'cody.signInNotification:shown',
            'cody.auth:disconnected',
            'cody.auth:disconnected',
            'cody.auth:disconnected',
        ],
    })(
    'test enterprise customers should get logged out for dotcomUrl',
    async ({ page, sidebar, nap }) => {
        await sidebar?.getByRole('button', { name: 'Sign In to Your Enterprise Instance' }).click()
        await page.getByRole('option', { name: 'Sign In with URL and Access Token' }).click()
        await page.getByRole('combobox', { name: 'input' }).fill(SERVER_URL)
        await page.getByRole('combobox', { name: 'input' }).press('Enter')
        await page.getByRole('combobox', { name: 'input' }).fill(VALID_TOKEN)
        await page.getByRole('combobox', { name: 'input' }).press('Enter')

        await expect(
            page
                .getByLabel(/^Signed in to localhost/, { exact: false })
                .locator('div')
                .nth(2)
        ).toBeVisible()

        await focusSidebar(page)

        // Makes sure the sign in page is loaded in the sidebar view with Cody: Chat as the heading
        // instead of the chat panel.
        const sidebarFrame = getChatSidebarPanel(page)
        await expect(
            sidebarFrame.getByRole('button', { name: 'Sign In to Your Enterprise Instance' })
        ).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Cody: Chat' })).toBeVisible()
        // Expect status bar to show the sign in button.
        await expect(page.getByRole('button', { name: 'cody-logo-heavy Sign In, Sign' })).toBeVisible()
    }
)
