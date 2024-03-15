import { expect } from '@playwright/test'
import * as mockServer from '../fixtures/mock-server'

import { sidebarSignin } from './common'
import { type DotcomUrlOverride, type ExpectedEvents, test as baseTest } from './helpers'

const test = baseTest.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })

test.extend<ExpectedEvents>({
    // list of events we expect this test to log, add to this list as needed
    expectedEvents: [
        'CodyInstalled',
        'CodyVSCodeExtension:Auth:failed',
        'CodyVSCodeExtension:auth:clickOtherSignInOptions',
        'CodyVSCodeExtension:login:clicked',
        'CodyVSCodeExtension:auth:selectSigninMenu',
        'CodyVSCodeExtension:auth:fromToken',
        'CodyVSCodeExtension:Auth:connected',
    ],
})('shows no support link for free users', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)

    const supportLocator = page.getByRole('treeitem', { name: 'Support' }).locator('a')
    expect(supportLocator).not.toBeVisible()

    // Check it's not in treeview

    const supportButton = page.getByLabel('Cody Support, feedback & support').locator('div')
    expect(supportButton).not.toBeVisible()

    // Check it's not in settings quickpick

    const statusBarButton = page.getByRole('button', { name: 'cody-logo-heavy, Cody Settings' })
    await statusBarButton.click()

    const input = page.getByPlaceholder('Choose an option')
    await input.fill('support')

    const supportItem = page.getByLabel('question  Cody Support')
    expect(supportItem).not.toBeVisible()
})

test.extend<ExpectedEvents>({
    // list of events we expect this test to log, add to this list as needed
    expectedEvents: [
        'CodyInstalled',
        'CodyVSCodeExtension:Auth:failed',
        'CodyVSCodeExtension:auth:clickOtherSignInOptions',
        'CodyVSCodeExtension:login:clicked',
        'CodyVSCodeExtension:auth:selectSigninMenu',
        'CodyVSCodeExtension:auth:fromToken',
        'CodyVSCodeExtension:Auth:connected',
    ],
})('shows support link for pro users', async ({ page, sidebar }) => {
    await fetch(`${mockServer.SERVER_URL}/.test/currentUser/codyProEnabled`, { method: 'POST' })

    await sidebarSignin(page, sidebar)

    // Check it's in treeview

    const supportLocator = page.getByRole('treeitem', { name: 'Support' }).locator('a')
    expect(supportLocator).toBeVisible()

    // Check it's in settings quickpick

    const statusBarButton = page.getByRole('button', { name: 'cody-logo-heavy, Cody Settings' })
    await statusBarButton.click()

    const input = page.getByPlaceholder('Choose an option')
    await input.fill('support')

    const supportItem = page.getByLabel('question  Cody Support')
    expect(supportItem).toBeVisible()
})
