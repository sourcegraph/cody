import { expect } from '@playwright/test'
import * as mockServer from '../fixtures/mock-server'

import { sidebarSignin } from './common'
import { type DotcomUrlOverride, test as baseTest } from './helpers'

const test = baseTest.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })

test('shows support link for free users', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)

    // Check it's in settings quickpick

    const statusBarButton = page.getByRole('button', { name: 'cody-logo-heavy, Cody Settings' })
    await statusBarButton.click()

    const input = page.getByPlaceholder('Choose an option')
    await input.fill('support')

    const supportItem = page.getByLabel('question  Cody Support')
    expect(supportItem).toBeVisible()
})

test('shows support link for pro users', async ({ page, sidebar }) => {
    await fetch(`${mockServer.SERVER_URL}/.test/currentUser/codyProEnabled`, { method: 'POST' })

    await sidebarSignin(page, sidebar)

    // Check it's in settings quickpick

    const statusBarButton = page.getByRole('button', { name: 'cody-logo-heavy, Cody Settings' })
    await statusBarButton.click()

    const input = page.getByPlaceholder('Choose an option')
    await input.fill('support')

    const supportItem = page.getByLabel('question  Cody Support')
    expect(supportItem).toBeVisible()
})
