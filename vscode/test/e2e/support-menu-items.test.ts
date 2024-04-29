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
})('shows support link for free users', async ({ page, sidebar }) => {
    await sidebarSignin(page, sidebar)

    // The treeitem we need is offscreen, and locator.scrollIntoViewIfNeeded
    // doesn't work as because VS Code's treeview lazily creates DOM nodes. So
    // we need to emulate mouse wheeling down, just as a user would have to do.
    const treeviewLocator = page.getByRole('tree', { name: 'Settings & Support' })
    await treeviewLocator.hover()
    await page.mouse.wheel(0, 1000) // arbitrarily large deltaY px

    const supportLocator = page.getByRole('treeitem', { name: 'Support' }).locator('a')
    expect(supportLocator).toBeAttached()

    // Check it's in settings quickpick

    const statusBarButton = page.getByRole('button', { name: 'cody-logo-heavy, Cody Settings' })
    await statusBarButton.click()

    const input = page.getByPlaceholder('Choose an option')
    await input.fill('support')

    const supportItem = page.getByLabel('question  Cody Support')
    expect(supportItem).toBeVisible()
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

    // The treeitem we need is offscreen, and locator.scrollIntoViewIfNeeded
    // doesn't work as because VS Code's treeview lazily creates DOM nodes. So
    // we need to emulate mouse wheeling down, just as a user would have to do.
    const treeviewLocator = page.getByRole('tree', { name: 'Settings & Support' })
    await treeviewLocator.hover()
    await page.mouse.wheel(0, 1000) // arbitrarily large deltaY px

    const supportLocator = page.getByRole('treeitem', { name: 'Support' }).locator('a')
    await supportLocator.scrollIntoViewIfNeeded()
    expect(supportLocator).toBeVisible()

    // Check it's in settings quickpick

    const statusBarButton = page.getByRole('button', { name: 'cody-logo-heavy, Cody Settings' })
    await statusBarButton.click()

    const input = page.getByPlaceholder('Choose an option')
    await input.fill('support')

    const supportItem = page.getByLabel('question  Cody Support')
    expect(supportItem).toBeVisible()
})
