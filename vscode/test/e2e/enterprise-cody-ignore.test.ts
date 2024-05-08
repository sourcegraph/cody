import fs from 'node:fs/promises'
import path from 'node:path'
import { type Frame, type Page, expect } from '@playwright/test'
import type { ContextFilters } from '@sourcegraph/cody-shared'
import { sidebarExplorer, sidebarSignin } from './common'
import {
    type ExpectedEvents,
    type WorkspaceDirectory,
    executeCommandInPalette,
    getMetaKeyByOS,
    spawn,
    test,
    withTempDir,
} from './helpers'

test
    .extend<ExpectedEvents>({
        // list of events we expect this test to log, add to this list as needed
        expectEvents: [
            'CodyInstalled',
            'CodyVSCodeExtension:codyIgnore:hasFile',
            'CodyVSCodeExtension:Auth:failed',
            'CodyVSCodeExtension:auth:clickOtherSignInOptions',
            'CodyVSCodeExtension:login:clicked',
            'CodyVSCodeExtension:auth:selectSigninMenu',
            'CodyVSCodeExtension:auth:fromToken',
            'CodyVSCodeExtension:Auth:connected',
            'CodyVSCodeExtension:chat-question:submitted',
            'CodyVSCodeExtension:chat-question:executed',
            'CodyVSCodeExtension:command:explain:clicked',
            'CodyVSCodeExtension:command:explain:executed',
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
            'cody.chat-question:submitted',
            'cody.chat-question:executed',
            'cody.chatResponse:noCode',
        ],
    })
    .extend<WorkspaceDirectory>({
        // biome-ignore lint/correctness/noEmptyPattern: Playwright needs empty pattern to specify "no dependencies".
        workspaceDirectory: async ({}, use) => {
            await withTempDir(async dir => {
                // Initialize a git repository there
                await spawn('git', ['init'], { cwd: dir })
                await spawn('git', ['config', 'user.name', 'Test User'], { cwd: dir })
                await spawn('git', ['config', 'user.email', 'test@example.host'], { cwd: dir })
                await spawn(
                    'git',
                    ['remote', 'add', 'origin', 'git@github.com:sourcegraph/sourcegraph.git'],
                    { cwd: dir }
                )

                // Commit some content to the git repository.
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
        await setUpAndOverwriteContextFilters(page, sidebar, {
            include: [],
            exclude: [{ repoNamePattern: 'cody' }],
        })

        server
            .onGraphQl('ContextFilters')
            .replyJson({ data: { repository: { name: 'github.com/sourcegraph/sourcegraph' } } })

        // Open a file from workspace3
        // NOTE: This workspace, since it's checked into the Cody repo, will report
        // as `github.com/sourcegraph/cody` and thus be part of the ignore pattern.
        await sidebarExplorer(page).click()
        await page.getByRole('treeitem', { name: 'foo.ts' }).locator('a').dblclick()
        await page.getByRole('tab', { name: 'foo.ts' }).hover()

        // Cody icon in the status bar should shows that the file is being ignored
        const statusBarButton = page.getByRole('button', {
            name: 'cody-logo-heavy-slash File Ignored, The current file is ignored by Cody',
        })
        await statusBarButton.hover()
        await expect(statusBarButton).toBeVisible()

        await page.getByRole('tab', { name: 'Cody', exact: true }).locator('a').click()
    }
)

async function setUpAndOverwriteContextFilters(
    page: Page,
    sidebar: Frame | null,
    filters: ContextFilters
) {
    // Sign into Cody
    await sidebarSignin(page, sidebar)

    // Enable overwrite policy
    const metaKey = getMetaKeyByOS()
    await page.keyboard.press(`${metaKey}+Shift+P`)
    await executeCommandInPalette(page, '[Internal] Set Context Filters Overwrite')
    await page.keyboard.insertText(JSON.stringify(filters))
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100) // Give the updates some time to settle
}
