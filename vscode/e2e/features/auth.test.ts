import { expect } from '@playwright/test'
import { fixture as test, uix } from '../utils/vscody'

test.describe('Auth', () => {
    test.use({
        templateWorkspaceDir: 'test/fixtures/workspace',
    })
    test('Pre-Authenticated', async ({ page, vscodeUI, workspaceDir }) => {
        const session = uix.vscode.Session.pending({ page, vscodeUI, workspaceDir })
        await test.step('setup', async () => {
            await uix.cody.preAuthenticate({ workspaceDir })
            await session.start()
            await uix.cody.waitForStartup({ page })

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
