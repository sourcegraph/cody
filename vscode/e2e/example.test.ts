import { expect } from '@playwright/test'
import { fixture as test, uix } from './utils/vscody'

test.describe('Demonstrations', () => {
    test.skip(true, "This isn't an actual working test. Just here to show what the API looks like")
    test.use({
        templateWorkspaceDir: 'test/fixtures/workspace',
    })
    test('Show off v2 features', async ({
        page,
        mitmProxy,
        vscodeUI,
        polly,
        executeCommand,
        workspaceDir,
    }) => {
        polly.server.host(mitmProxy.sourcegraph.dotcom.proxyTarget, () => {
            polly.server
                .post('/.api/graphql')
                .filter(req => 'RecordTelemetryEvents' in req.query)
                .intercept((req, res, interceptor) => {
                    console.log('Custom interceptor')
                    res.sendStatus(500)
                })
        })
        await uix.workspace.modifySettings(
            existing => ({ ...existing, 'workbench.colorTheme': 'Default Light Modern' }),
            { workspaceDir }
        )
        await uix.vscode.startSession({ page, vscodeUI, executeCommand, workspaceDir })
        await uix.cody.waitForStartup({ page })

        await executeCommand('workbench.action.closeAllEditors')
        await executeCommand('workbench.action.showRuntimeExtensions')

        await page.click('[aria-label="Cody"]')

        await executeCommand('workbench.explorer.fileView.focus')

        await page.click('[aria-label="Cody"]')

        const [signInView, ...otherWebviews] = await uix.cody.WebView.all({ page }, { atLeast: 1 })

        expect(signInView).toBeTruthy()
        expect(otherWebviews).toHaveLength(0)

        await signInView.waitUntilReady()
        await expect(signInView.wrapper).toBeVisible()

        await expect(
            signInView.content.getByRole('button', { name: 'Sign In to Your Enterprise Instance' })
        ).toBeVisible()
    })

    test('also works', async ({ page, mitmProxy, vscodeUI, executeCommand }) => {
        await uix.cody.dummy()
    })
})
