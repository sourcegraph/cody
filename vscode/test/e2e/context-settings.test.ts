import { expect } from '@playwright/test'

import { sidebarSignin } from './common'
import { type ExpectedEvents, newChat, test } from './helpers'

import type { RepoListResponse } from '@sourcegraph/cody-shared'

test.extend<ExpectedEvents>({
    // list of events we expect this test to log, add to this list as needed
    expectedEvents: [
        'CodyVSCodeExtension:auth:clickOtherSignInOptions',
        'CodyVSCodeExtension:login:clicked',
        'CodyVSCodeExtension:auth:selectSigninMenu',
        'CodyVSCodeExtension:auth:fromToken',
        'CodyVSCodeExtension:Auth:connected',
        'CodyVSCodeExtension:useEnhancedContextToggler:clicked',
    ],
    expectedV2Events: [
        // 'cody.extension:installed', // ToDo: Uncomment once this bug is resolved: https://github.com/sourcegraph/cody/issues/3825
        'cody.extension:savedLogin',
        'cody.codyIgnore:hasFile',
        'cody.auth:failed',
        'cody.auth.login:clicked',
        'cody.auth.signin.menu:clicked',
        'cody.auth.login:firstEver',
        'cody.auth.signin.token:clicked',
        'cody.auth:connected',
    ],
})('enhanced context selector is keyboard accessible', async ({ page, sidebar }) => {
    // This test requires that the window be focused in the OS window manager because it deals with
    // focus.
    await page.bringToFront()

    await sidebarSignin(page, sidebar)
    const chatFrame = await newChat(page)

    // Opening the enhanced context settings should focus the checkbox for toggling it.
    const enhancedContextCheckbox = chatFrame.locator('#enhanced-context-checkbox')
    await expect(enhancedContextCheckbox).toBeFocused()

    // Enhanced context should be enabled by default.
    await expect(enhancedContextCheckbox).toBeChecked()
    await page.keyboard.press('Space') // Disable enhanced context
    // The keyboard should toggle the checkbox, but not dismiss the popup.
    await expect(enhancedContextCheckbox).not.toBeChecked()
    await expect(enhancedContextCheckbox).toBeVisible()

    // The popup should be dismiss-able with the keyboard.
    await page.keyboard.press('Escape')
    // Closing the enhanced context settings should close the dialog...
    await expect(enhancedContextCheckbox).not.toBeVisible()
    // ... and the focus is moved to the chat input on close.
    const contextSettingsButton = chatFrame.getByTitle('Configure Enhanced Context')
    await expect(contextSettingsButton.and(page.locator(':focus'))).not.toBeVisible()
    const chatInput = chatFrame.getByRole('textbox', { name: 'Chat message' })
    await expect(chatInput).toBeFocused()

    // Tab should move the focus to the Enhanced Context Toggle button
    await chatInput.press('Tab')
    await expect(chatFrame.getByTitle('Enable Enhanced Context')).toBeFocused()

    // Enter/Space key should toggle the setting
    await page.keyboard.press('Space') // From disabled to enabled
    await expect(chatFrame.getByTitle('Disable Enhanced Context')).toBeFocused()
    await page.keyboard.press('Enter') // From enabled to disabled
    await expect(chatFrame.getByTitle('Enable Enhanced Context')).toBeFocused()
})

test.extend<ExpectedEvents>({
    expectedEvents: [
        'CodyInstalled',
        'CodyVSCodeExtension:codyIgnore:hasFile',
        'CodyVSCodeExtension:Auth:failed',
        'CodyVSCodeExtension:auth:clickOtherSignInOptions',
        'CodyVSCodeExtension:login:clicked',
        'CodyVSCodeExtension:auth:selectSigninMenu',
        'CodyVSCodeExtension:auth:fromToken',
        'CodyVSCodeExtension:Auth:connected',
    ],
    expectedV2Events: [
        // 'cody.extension:installed', // ToDo: Uncomment once this bug is resolved: https://github.com/sourcegraph/cody/issues/3825
        'cody.extension:savedLogin',
        'cody.codyIgnore:hasFile',
        'cody.auth:failed',
        'cody.auth.login:clicked',
        'cody.auth.signin.menu:clicked',
        'cody.auth.login:firstEver',
        'cody.auth.signin.token:clicked',
        'cody.auth:connected',
    ],
})('enterprise context selector can pick repos', async ({ page, sidebar, server, expectedEvents }) => {
    const repos1: RepoListResponse = {
        repositories: {
            nodes: [
                {
                    id: 'WOOZL',
                    name: 'repo/foo',
                },
            ],
            pageInfo: {
                endCursor: 'WOOZL',
            },
        },
    }
    const repos2: RepoListResponse = {
        repositories: {
            nodes: [
                {
                    id: 'WUZLE',
                    name: 'repo/bar',
                },
            ],
            pageInfo: {
                endCursor: null,
            },
        },
    }
    server.onGraphQl('Repositories').replyJson({ data: repos1 }).next().replyJson({ data: repos2 })

    await sidebarSignin(page, sidebar)
    const chatFrame = await newChat(page)

    // Because there are no repositories in the workspace, none should be selected by default.
    await expect(chatFrame.getByText('No repositories selected')).toBeVisible()

    // Choosing a repository should open the repository picker.
    const chooseReposButton = chatFrame.getByRole('button', { name: 'Choose Repositories' })
    await chooseReposButton.click()
    const repoPicker = page.getByText(/Choose up to \d+ more repositories/)
    await expect(repoPicker).toBeVisible()

    // Opening the picker should not close the enhanced context status widget.
    await expect(chooseReposButton).toBeVisible()

    // Repositories listed on the remote should be present in the picker.
    const repoFoo = page.getByText('repo/foo')
    const repoBar = page.getByText('repo/bar')
    await expect(repoFoo).toBeVisible()
    await expect(repoBar).toBeVisible()

    // Typing should filter the list of repositories.
    await page.keyboard.type('o/f')
    await expect(repoBar).not.toBeVisible()

    // Choosing should dismiss the repo picker, but not the enhanced context
    // settings widget.
    await repoFoo.click()
    await page.waitForTimeout(100)
    await page.keyboard.type('\n')
    await expect(repoPicker).not.toBeVisible()
    await expect(chooseReposButton).toBeVisible()

    // The chosen repo should appear in the picker.
    await expect(chatFrame.getByTitle('repo/foo').getByText(/^foo$/)).toBeVisible()
})
