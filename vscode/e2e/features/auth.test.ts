import { expect } from '@playwright/test'
import { fixture as test, uix } from '../utils/vscody'
import { MITM_AUTH_TOKEN_PLACEHOLDER } from '../utils/vscody/constants'
import { modifySettings } from '../utils/vscody/uix/workspace'

test.describe('Auth', () => {
    test.use({
        templateWorkspaceDir: 'test/fixtures/legacy-polyglot-template',
    })
    test('Pre-Authenticated', async ({ page, vscodeUI, workspaceDir, mitmProxy }) => {
        const session = uix.vscode.Session.pending({ page, vscodeUI, workspaceDir })
        const cody = uix.cody.Extension.with({ page, workspaceDir })

        await test.step('setup', async () => {
            await modifySettings(
                s => ({
                    ...s,
                    'cody.accessToken': MITM_AUTH_TOKEN_PLACEHOLDER,
                    'cody.serverEndpoint': mitmProxy.sourcegraph.dotcom.endpoint,
                }),
                { workspaceDir }
            )
            await session.start()
            await cody.waitUntilReady()

            await session.runCommand('workbench.view.extension.cody')
        })

        await test.step('can view account info', async () => {
            const [sidebar] = await uix.cody.WebView.all({ page }, { atLeast: 1 })
            await sidebar.content.getByTestId('tab-account').click()

            await expect(page.getByText('Signed in as SourcegraphBot')).toBeVisible()
            await expect(page.getByText('Plan: Cody Pro')).toBeVisible()
        })
    })
})
