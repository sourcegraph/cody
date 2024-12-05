import { expect } from '@playwright/test'
import { SERVER_URL, VALID_TOKEN } from '../fixtures/mock-server'
import { expectSignInPage, sidebarSignin } from './common'
import {
    type ClientConfigSingletonFetchIntervalOverride,
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
            'cody.auth.login:clicked',
            'cody.auth.login.token:clicked',
            'cody.auth:disconnected',
            'cody.signInNotification:shown',
        ],
    })('test enterprise customers cannot log into dotcomUrl', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar, { skipAssertions: true })
    await expect(
        page
            .frameLocator('iframe')
            .first()
            .frameLocator('iframe[title="Chat"]')
            .getByText('Based on your email address')
    ).toBeVisible()

    await expectSignInPage(page)
})

const fetchInterval = 500
test
    .extend<DotcomUrlOverride>({
        dotcomUrl: SERVER_URL,
    })
    .extend<ClientConfigSingletonFetchIntervalOverride>({
        clientConfigSingletonFetchInterval: [
            async ({}, use) => {
                process.env.CLIENT_CONFIG_SINGLETON_REFETCH_INTERVAL = '500'
                await use(fetchInterval)
            },
            { scope: 'test' }, // Scope to this specific test
        ],
    })
    .extend<ExpectedV2Events>({
        // list of V2 telemetry events we expect this test to log, add to this list as needed
        expectedV2Events: [
            'cody.extension:installed',
            'cody.auth.login:clicked',
            'cody.auth.login.token:clicked',
            'cody.auth:disconnected',
            'cody.signInNotification:shown',
            'cody.auth:connected',
            'cody.auth.login:firstEver',
            'cody.interactiveTutorial:attemptingStart',
            'cody.experiment.interactiveTutorial:enrolled',
        ],
    })(
    'logs out the user when userShouldUseEnterprise is set to true',
    async ({ page, sidebar, server }) => {
        await sidebarSignin(page, sidebar, { skipAssertions: true })
        await server.setUserShouldUseEnterprise(true)

        await expect(
            page
                .frameLocator('iframe')
                .first()
                .frameLocator('iframe[title="Chat"]')
                .getByText('Based on your email address')
        ).toBeVisible({
            timeout: fetchInterval * 2,
        })

        await expectSignInPage(page)
    }
)
