import { writeFile } from 'node:fs/promises'
import path from 'node:path'
// import { setTimeout } from 'node:timers/promises'
import { expect } from '@playwright/test'
// import { stretchTimeout } from '../../utils/helpers'
import { fixture as test, uix } from '../../utils/vscody'
import { MITM_AUTH_TOKEN_PLACEHOLDER } from '../../utils/vscody/constants'
import { gitInit, modifySettings } from '../../utils/vscody/uix/workspace'

test.use({
    templateWorkspaceDir: 'test/fixtures/workspace',
})

test.describe('cody ignore', {}, () => {
    test('it works', async ({ workspaceDir, page, vscodeUI, mitmProxy, polly }, testInfo) => {
        const session = uix.vscode.Session.pending({ page, vscodeUI, workspaceDir })
        const cody = uix.cody.Extension.with({ page, workspaceDir })

        await test.step('setup', async () => {
            mitmProxy.sourcegraph.enterprise.authName = 'enterprise'
            await modifySettings(
                s => ({
                    ...s,
                    'cody.accessToken': MITM_AUTH_TOKEN_PLACEHOLDER,
                    'cody.serverEndpoint': mitmProxy.sourcegraph.enterprise.endpoint,
                }),
                { workspaceDir }
            )
            //just some mock handlers
            polly.server.host(mitmProxy.sourcegraph.enterprise.proxyTarget, () => {
                polly.server
                    .post('/.api/graphql')
                    .filter(req => 'ContextFilters' in req.query)
                    .intercept((req, res, interceptor) => {
                        res.json(BLOCK_CONTEXT_FILTERS_RESPONSE).status(200)
                    })
                polly.server
                    .post('/.api/graphql')
                    .filter(req => 'ResolveRepoName' in req.query)
                    .intercept((req, res, interceptor) => {
                        res.json(RESOLVE_REPO_NAME_RESPONSE).status(200)
                    })
            })

            await gitInit({ origin: 'git@github.com:sourcegraph/sourcegraph.git' }, { workspaceDir })

            await session.start()
            await cody.waitUntilReady()
        })

        // we test this in a new file so that we can ensure that it too is
        // ignored even if it didn't exist in the repo yet.
        await writeFile(
            path.join(workspaceDir, 'foo.ts'),
            '// What is the meaning of life?\n\nfunction foo() {\n  return 42\n}\n'
        )
        await session.editor.openFile({ workspaceFile: 'foo.ts' })

        // Cody icon in the status bar should shows that the file is being ignored
        await expect(cody.statusBar).toBeVisible()
        await expect(cody.statusBar).toContainText('File Ignored')

        // Clicking it shows an error notice
        await cody.statusBar.click()
        await expect(session.QuickPick.items({ hasText: 'Cody is disabled in this file' })).toBeVisible()
        await session.QuickPick.dismiss()

        // Invoking autocomplete
        await session.editor.select({
            selection: { start: { line: 2, col: 9999 }, end: { line: 3, col: 9999 } },
        })
        await session.runCommand('cody.autocomplete.manual-trigger')

        // Manual autocomplete
        await expect(session.Notifications.toasts.filter({ hasText: 'file is ignored' })).toBeVisible()
        await session.runCommand('notifications.clearAll')

        // Commands are blocked too

        const commands = [
            ['cody.command.edit-code', 'Edit failed to run'],
            // VSCode seems to have some rate-limit on notifications so we can't
            // fire them too quickly. Given that these are all similar commands
            // I don't really see any value in testing every single one anyways

            // ['cody.command.document-code', 'Edit failed to run'],
            // ['cody.command.explain-code', 'Command failed to run'],
            // ['cody.command.unit-tests', 'Failed to generate test'],
            // ['cody.command.smell-code', 'Command failed to run'],
        ]
        for (const [command, title] of commands) {
            await session.editor.select({
                selection: { start: { line: 2, col: 1 }, end: { line: 4, col: 9999 } },
            })
            await session.runCommand(command)
            await expect(
                session.Notifications.toasts.filter({ hasText: `${title}: file is ignored` })
            ).toBeVisible()
            await session.runCommand('notifications.clearAll')
            await expect(session.Notifications.toasts.first()).not.toBeVisible()
        }
    })
})

const RESOLVE_REPO_NAME_RESPONSE = {
    data: { repository: { name: 'github.com/sourcegraph/sourcegraph' } },
}
const BLOCK_CONTEXT_FILTERS_RESPONSE = {
    data: {
        site: {
            codyContextFilters: {
                raw: {
                    include: [],
                    exclude: [
                        {
                            repoNamePattern: '^github.com/sourcegraph/sourcegraph$',
                        },
                    ],
                },
            },
        },
    },
}
