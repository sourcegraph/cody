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
        await uix.cody.preAuthenticate({ workspaceDir })
        await uix.vscode.startSession({ page, vscodeUI, executeCommand, workspaceDir })
        await uix.cody.waitForStartup()

        await executeCommand('workbench.view.extension.cody')

        const sidebar = uix.vscode.Sidebar.get({ page })

        await sidebar.locator
            .locator('div[aria-label="Settings & Support"]')
            .locator('div[aria-label="Account"]')
            .click()

        await expect(page.getByText('Signed in as SourcegraphBot')).toBeVisible()
        await expect(page.getByText('Plan: Cody Pro')).toBeVisible()
    })
})
