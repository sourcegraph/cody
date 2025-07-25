import { expect } from '@playwright/test'
import { SERVER_URL, VALID_TOKEN, VALID_TOKEN_PERSON2 } from '../fixtures/mock-server'
import { expectSignInPage, sidebarSignin } from './common'
import {
    type ClientConfigSingletonRefetchIntervalOverride,
    type DotcomUrlOverride,
    type EnterpriseTestOptions,
    type ExpectedV2Events,
    signOut,
    test,
} from './helpers'

test.extend<ExpectedV2Events>({
    // list of V2 telemetry events we expect this test to log, add to this list as needed
    expectedV2Events: [
        'cody.extension:installed',
        'cody.auth.login:firstEver',
        'cody.auth.login.token:clicked',
        'cody.auth:connected',
        'cody.auth.logout:clicked',
        'cody.auth:disconnected',
        'cody.signInNotification:shown',
    ],
})('requires a valid auth token and allows logouts', async ({ page, sidebar }) => {
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
    // await page.waitForTimeout(5000)
    // page.pause()
    await expect(sidebar!.getByTestId('new-chat-button')).toBeVisible()

    // Sign out.
    await signOut(page)
    await expectSignInPage(page)
})

// When an enterprise customer tries to log into a dotcom url, an error message is shown.
test
    .extend<DotcomUrlOverride>({
        dotcomUrl: SERVER_URL,
    })
    .extend<EnterpriseTestOptions>({
        shouldUseEnterprise: true,
    })
    .extend<ExpectedV2Events>({
        // list of V2 telemetry events we expect this test to log, add to this list as needed
        expectedV2Events: [
            'cody.extension:installed',
            'cody.auth.login.token:clicked',
            'cody.auth:disconnected',
            'cody.signInNotification:shown',
        ],
    })('test enterprise customers cannot log into dotcomUrl', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar, { skipAssertions: true })
    await expectSignInPage(page)
    await expect(
        page
            .frameLocator('iframe')
            .first()
            .frameLocator('iframe[title="Chat"]')
            .getByText('Based on your email address')
    ).toBeVisible()
})

const refetchInterval = 500
test
    .extend<DotcomUrlOverride>({
        dotcomUrl: SERVER_URL,
    })
    .extend<ClientConfigSingletonRefetchIntervalOverride>({
        clientConfigSingletonRefetchInterval: refetchInterval,
    })
    .extend<ExpectedV2Events>({
        // list of V2 telemetry events we expect this test to log, add to this list as needed
        expectedV2Events: [
            'cody.extension:installed',
            'cody.auth.login.token:clicked',
            'cody.auth:disconnected',
            'cody.signInNotification:shown',
        ],
    })(
    'logs out the user when userShouldUseEnterprise is set to true',
    async ({ page, sidebar, server }) => {
        await sidebarSignin(page, sidebar, { skipAssertions: true })
        await server.setUserShouldUseEnterprise(true)
        await expectSignInPage(page)
        await expect(
            page
                .frameLocator('iframe')
                .first()
                .frameLocator('iframe[title="Chat"]')
                .getByText('Based on your email address')
        ).toBeVisible({
            timeout: refetchInterval * 10,
        })
    }
)

// TODO: Fix flaky test
test.extend<ExpectedV2Events>({
    expectedV2Events: [
        'cody.extension:installed',
        'cody.auth.login:firstEver',
        'cody.auth.login.token:clicked',
        'cody.auth:connected',
        'cody.userMenu:open',
        'cody.auth:disconnected',
        'cody.signInNotification:shown',
    ],
})
    .skip('switch account via account dropwdown menu in webview', async ({ page, sidebar }) => {
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
        await expect(sidebar!.getByRole('button', { name: /New Chat/i })).toBeVisible()
        await sidebar!.getByLabel('Account Menu Button').click({ delay: 2000 })

        const codeWebview = sidebar!.getByLabel('cody-webview')

        // Should have logged into the default account "Person"
        await expect(codeWebview.getByText('Enterprise')).toBeVisible()
        await expect(codeWebview.getByText('Person', { exact: true })).toBeVisible()
        await expect(codeWebview.getByText('person@company.com')).toBeVisible()

        // Make sure the options are visible
        await expect(sidebar!.getByRole('option', { name: 'Extension Settings' })).toBeVisible()
        await expect(sidebar!.getByRole('option', { name: 'Switch Account' })).toBeVisible()
        await expect(sidebar!.getByRole('option', { name: 'Sign Out' })).toBeVisible()
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
        await sidebar!.getByLabel('Account Menu Button').click({ delay: 2000 })

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
