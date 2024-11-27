import { expect } from '@playwright/test'
import { SERVER_URL, VALID_TOKEN } from '../fixtures/mock-server'

import { focusSidebar, getChatSidebarPanel } from './common'
import { type ExpectedV2Events, signOut, test } from './helpers'

test.extend<ExpectedV2Events>({
    // list of V2 telemetry events we expect this test to log, add to this list as needed
    expectedV2Events: [
        'cody.extension:installed',
        'cody.auth.login:firstEver',
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
