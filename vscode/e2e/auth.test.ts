import { expect } from '@playwright/test'
import { fixture as test, uix } from './utils/vscody'

test.describe('Auth', () => {
    test.use({
        templateWorkspaceDir: 'test/fixtures/workspace',
    })
    test('Pre-Authenticated', async ({
        page,
        mitmProxy,
        vscodeUI,
        polly,
        executeCommand,
        workspaceDir,
    }) => {
        await test.step('setup', async () => {
            await uix.cody.preAuthenticate({ workspaceDir })
            await uix.vscode.startSession({ page, vscodeUI, executeCommand, workspaceDir })
            await uix.cody.waitForStartup({ page })

            await executeCommand('workbench.view.extension.cody')
        })

        await test.step('can view account info', async () => {
            const [sidebar] = await uix.cody.WebView.all({ page }, { atLeast: 1 })
            await sidebar.content
                .locator('[id="radix-\\:r0\\:-trigger-account"]')
                .getByRole('button')
                .click()

            await expect(page.getByText('Signed in as SourcegraphBot')).toBeVisible()
            await expect(page.getByText('Plan: Cody Pro')).toBeVisible()
        })
    })
})
