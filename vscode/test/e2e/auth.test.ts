import { expect } from '@playwright/test'
import { SERVER_URL, VALID_TOKEN, VALID_TOKEN_PERSON2 } from '../fixtures/mock-server'

import { focusSidebar, getChatSidebarPanel } from './common'
import { type ExpectedV2Events, signOut, test } from './helpers'

test.extend<ExpectedV2Events>({
    // list of V2 telemetry events we expect this test to log, add to this list as needed
    expectedV2Events: [
        'cody.extension:installed',
        'cody.auth.login:clicked',
        'cody.auth.login:firstEver',
        'cody.auth.login.token:clicked',
        'cody.auth:connected',
        'cody.auth.logout:clicked',
        'cody.auth:disconnected',
        'cody.interactiveTutorial:attemptingStart',
        'cody.experiment.interactiveTutorial:enrolled',
        'cody.signInNotification:shown',
    ],
})('requires a valid auth token and allows logouts', async ({ page, sidebar }) => {
    await expect(sidebar!.getByText('Sign in to Sourcegraph')).toBeVisible()
    await sidebar!.getByRole('button', { name: 'Sourcegraph logo Continue' }).click()
    await sidebar!.getByText('Sourcegraph Instance URL').click()
    await sidebar!.getByPlaceholder('Example: https://instance.').click()
    await sidebar!.getByPlaceholder('Example: https://instance.').fill(SERVER_URL)

    await sidebar!.getByText('Access Token (Optional)').click()
    await sidebar!.getByPlaceholder('Access token...').fill('abcdefghijklmnopqrstuvwxyz')

    await sidebar!.getByRole('button', { name: 'Sign In' }).click()

    await expect(sidebar!.getByText('Invalid access token.')).toBeVisible()

    await sidebar!.getByPlaceholder('Access token...').click()
    await sidebar!.getByPlaceholder('Access token...').fill(VALID_TOKEN)
    await sidebar!.getByPlaceholder('Access token...').press('Enter')

    await expect(sidebar!.getByText('Invalid access token.')).not.toBeVisible()
    await expect(sidebar!.getByText('Sign in to Sourcegraph')).not.toBeVisible()
    await expect(sidebar!.getByLabel('Chat message')).toBeVisible()

    // Sign out.
    await signOut(page)
    await focusSidebar(page)

    // Makes sure the sign in page is loaded in the sidebar view with Cody: Chat as the heading
    // instead of the chat panel.
    const sidebarFrame = getChatSidebarPanel(page)
    await expect(sidebarFrame.getByText('Sign in to Sourcegraph')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Cody: Chat' })).toBeVisible()

    // Expect status bar to show the sign in button.
    await expect(page.getByRole('button', { name: 'cody-logo-heavy Sign In, Sign' })).toBeVisible()
})

test.extend<ExpectedV2Events>({
    expectedV2Events: [
        'cody.extension:installed',
        'cody.auth.login:clicked',
        'cody.auth.login:firstEver',
        'cody.auth.login.token:clicked',
        'cody.auth:connected',
        'cody.userMenu:open',
        'cody.auth:disconnected',
        'cody.interactiveTutorial:attemptingStart',
        'cody.experiment.interactiveTutorial:enrolled',
        'cody.signInNotification:shown',
    ],
})('switch account via account dropwdown menu in webview', async ({ page, sidebar }) => {
    await expect(sidebar!.getByText('Sign in to Sourcegraph')).toBeVisible()
    await sidebar!.getByRole('button', { name: 'Sourcegraph logo Continue' }).click()
    await sidebar!.getByText('Sourcegraph Instance URL').click()
    await sidebar!.getByPlaceholder('Example: https://instance.').click()
    await sidebar!.getByPlaceholder('Example: https://instance.').fill(SERVER_URL)

    await sidebar!.getByText('Access Token (Optional)').click()

    await sidebar!.getByPlaceholder('Access token...').click()
    await sidebar!.getByPlaceholder('Access token...').fill(VALID_TOKEN)
    await sidebar!.getByPlaceholder('Access token...').press('Enter')

    await expect(sidebar!.getByText('Invalid access token.')).not.toBeVisible()
    await expect(sidebar!.getByText('Sign in to Sourcegraph')).not.toBeVisible()
    await expect(sidebar!.getByLabel('Chat message')).toBeVisible()

    // Open the User Dropdown menu
    await expect(sidebar!.getByRole('button', { name: 'New Chat' })).toBeVisible()
    await expect(sidebar!.getByTestId('user-dropdown-menu')).toBeVisible()
    await sidebar!.getByTestId('user-dropdown-menu').click()

    const codeWebview = sidebar!.getByLabel('cody-webview')

    // Should have logged into the default account "Person"
    await expect(codeWebview.getByText('Enterprise')).toBeVisible()
    await expect(codeWebview.getByText('Person', { exact: true })).toBeVisible()
    await expect(codeWebview.getByText('person@company.com')).toBeVisible()

    // Make sure the options are visible
    await expect(sidebar!.getByRole('option', { name: 'Extension Settings' })).toBeVisible()
    await expect(sidebar!.getByRole('option', { name: 'Help' })).toBeVisible()

    await sidebar!.getByRole('option', { name: 'Switch Account' }).click()
    await expect(sidebar!.getByText('Active')).toBeVisible()
    await expect(sidebar!.getByText(SERVER_URL)).toBeVisible()

    await sidebar!.getByText('Add another account').click()
    await expect(sidebar!.getByText('Account Details')).toBeVisible()
    await expect(sidebar!.getByRole('button', { name: 'Add and Switch' })).toBeVisible()
    await sidebar!.getByLabel('Instance URL').click()
    await sidebar!.getByLabel('Instance URL').fill(SERVER_URL)
    await sidebar!.getByText('Access Token (Optional)').click()
    await sidebar!.getByPlaceholder('sgp_xxx_xxx').click()
    await sidebar!.getByPlaceholder('sgp_xxx_xxx').fill(VALID_TOKEN_PERSON2)
    await sidebar!.getByRole('button', { name: 'Add and Switch' }).click()

    // Makes sure the dropdown menu is closed.
    await expect(sidebar!.getByText('Account Details')).not.toBeVisible()
    await expect(sidebar!.getByRole('option', { name: 'Help' })).not.toBeVisible()

    // Should have switched to the new account "Person2". It'd take a few seconds for the webview to update.
    await sidebar!.getByText('Person 2', { exact: true }).hover()

    // Open dropdown menu
    await sidebar!.getByTestId('user-dropdown-menu').click({ delay: 2000 })

    await expect(sidebar!.getByRole('option', { name: 'Help' })).toBeVisible()
    await expect(codeWebview.getByText('Person', { exact: true })).not.toBeVisible()
    await expect(codeWebview.getByText('person2@company2.com')).toBeVisible()

    // Clicking on Cancel should move back to the Account Switcher view.
    await sidebar!.getByRole('option', { name: 'Switch Account' }).click()
    await sidebar!.getByText('Add another account').click()
    await expect(sidebar!.getByRole('button', { name: 'Add and Switch' })).toBeVisible()
    await sidebar!.getByRole('option', { name: 'Cancel' }).click()
    await expect(sidebar!.getByRole('button', { name: 'Add and Switch' })).not.toBeVisible()
    await expect(sidebar!.getByText(SERVER_URL)).toBeVisible()
})
