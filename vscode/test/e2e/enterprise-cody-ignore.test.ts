import fs from 'node:fs/promises'
import path from 'node:path'
import { type Page, expect } from '@playwright/test'
import { sidebarExplorer, sidebarSignin } from './common'
import {
    type ExpectedEvents,
    type WorkspaceDirectory,
    executeCommandInPalette,
    spawn,
    test,
    withTempDir,
} from './helpers'

test
    .extend<ExpectedEvents>({
        // list of events we expect this test to log, add to this list as needed
        expectEvents: [
            // 'CodyInstalled',
            // 'CodyVSCodeExtension:codyIgnore:hasFile',
            // 'CodyVSCodeExtension:Auth:failed',
            // 'CodyVSCodeExtension:auth:clickOtherSignInOptions',
            // 'CodyVSCodeExtension:login:clicked',
            // 'CodyVSCodeExtension:auth:selectSigninMenu',
            // 'CodyVSCodeExtension:auth:fromToken',
            // 'CodyVSCodeExtension:Auth:connected',
            // 'CodyVSCodeExtension:chat-question:submitted',
            // 'CodyVSCodeExtension:chat-question:executed',
            // 'CodyVSCodeExtension:command:explain:clicked',
            // 'CodyVSCodeExtension:command:explain:executed',
        ],
        expectedV2Events: [
            // 'cody.extension:installed', // ToDo: Uncomment once this bug is resolved: https://github.com/sourcegraph/cody/issues/3825
            // 'cody.extension:savedLogin',
            // 'cody.codyIgnore:hasFile',
            // 'cody.auth:failed',
            // 'cody.auth.login:clicked',
            // 'cody.auth.signin.menu:clicked',
            // 'cody.auth.login:firstEver',
            // 'cody.auth.signin.token:clicked',
            // 'cody.auth:connected',
            // 'cody.chat-question:submitted',
            // 'cody.chat-question:executed',
            // 'cody.chatResponse:noCode',
        ],
    })
    .extend<WorkspaceDirectory>({
        // biome-ignore lint/correctness/noEmptyPattern: Playwright needs empty pattern to specify "no dependencies".
        workspaceDirectory: async ({}, use) => {
            await withTempDir(async dir => {
                // Initialize a git repo
                await spawn('git', ['init'], { cwd: dir })
                await spawn(
                    'git',
                    ['remote', 'add', 'origin', 'git@github.com:sourcegraph/sourcegraph.git'],
                    { cwd: dir }
                )

                await Promise.all([
                    fs.writeFile(
                        path.join(dir, 'foo.ts'),
                        '// What is the meaning of life?\n\nfunction foo() {\n  return 42\n}\n'
                    ),
                ])

                await use(dir)
            })
        },
    })(
    'using actively invoked commands and autocomplete shows a error',
    async ({ page, server, sidebar }) => {
        server.onGraphQl('ContextFilters').replyJson({
            data: {
                site: {
                    codyContextFilters: {
                        raw: {
                            include: [],
                            exclude: [{ repoNamePattern: '^github.com/sourcegraph/sourcegraph$' }],
                        },
                    },
                },
            },
        })

        await sidebarSignin(page, sidebar, true)

        server
            .onGraphQl('ResolveRepoName')
            .replyJson({ data: { repository: { name: 'github.com/sourcegraph/sourcegraph' } } })

        await sidebarExplorer(page).click()
        await page.getByRole('treeitem', { name: 'foo.ts' }).locator('a').dblclick()
        await page.getByRole('tab', { name: 'foo.ts' }).hover()

        // Cody icon in the status bar should shows that the file is being ignored
        const statusBarButton = page.getByRole('button', {
            name: 'cody-logo-heavy-slash File Ignored, The current file is ignored by Cody',
        })
        await statusBarButton.hover()
        await expect(statusBarButton).toBeVisible()

        // Clicking on the Cody icon shows a message
        await statusBarButton.click()
        await expect(page.getByText('Cody is disabled in this file')).toBeVisible()
        await page.keyboard.press('Escape')

        // Opening the sidebar should show a notice
        await page.getByRole('tab', { name: 'Cody' }).click()
        await expect(
            page.getByText(
                'Commands are disabled for this file by an admin setting. Other Cody features are also disabled'
            )
        ).toBeVisible()

        // Manually invoking autocomplete should show an error
        await page.getByText('function foo() {').click()
        await executeCommandInPalette(page, 'Cody: Trigger Autocomplete at Cursor')
        await expectNotificationToBeVisible(
            page,
            'Failed to generate autocomplete: file is ignored (due to cody.contextFilters Enterprise configuration setting)'
        )

        await clearAllNotifications(page)

        // Manually invoking commands should show an error
        const commands = [
            ['Edit Code', 'Edit failed to run'],
            ['Document Code', 'Edit failed to run'],
            ['Explain Code', 'Command failed to run'],
            ['Generate Unit Tests', 'Failed to generate test'],
            ['Find Code Smells', 'Command failed to run'],
        ]
        for (const [command, title] of commands) {
            // Trigger an edit action should show a notification
            await page.getByText('function foo() {').click()
            await page.keyboard.down('Shift')
            await page.keyboard.press('ArrowDown')
            await page.getByRole('button', { name: 'Cody Commands' }).click()
            await page.getByRole('option', { name: command }).click()
            await expectNotificationToBeVisible(
                page,
                `${title}: file is ignored (due to cody.contextFilters Enterprise configuration setting)`
            )
            await page.locator('.notification-list-item').hover()
            await page.getByRole('button', { name: 'Clear Notification' }).click()
        }
    }
)

async function clearAllNotifications(page: Page) {
    await executeCommandInPalette(page, 'Notifications: Clear All Notifications')
}

async function expectNotificationToBeVisible(page: Page, text: string) {
    return expect(
        page.locator('.notification-list-item', {
            hasText: text,
        })
    ).toBeVisible()
}
