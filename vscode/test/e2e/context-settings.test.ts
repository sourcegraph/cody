import { expect } from '@playwright/test'

import { sidebarSignin } from './common'
import { type ExpectedEvents, newChat, test } from './helpers'

import type { RepoListResponse } from '@sourcegraph/cody-shared'

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
                    url: '/repo/foo',
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
                    url: '/repo/foo',
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

    const openEnhancedContextButton = chatFrame.getByRole('button', {
        name: 'Configure automatic code context',
    })
    await openEnhancedContextButton.click()

    // Because there are no repositories in the workspace, none should be selected by default.
    await expect(chatFrame.getByText('No repositories selected')).toBeVisible()

    // Choosing a repository should open the repository picker.
    const chooseReposButton = chatFrame.getByRole('button', { name: 'Choose Repositories' })
    await expect(chooseReposButton).toBeVisible()
    await chooseReposButton.hover()
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
