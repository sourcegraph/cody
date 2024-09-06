import { expect } from '@playwright/test'
import { fixture as test, uix } from './utils/vscody'

test.describe('Demonstrations', () => {
    // test.skip(true, "This isn't an actual working test. Just here to show what the API looks like")
    test.use({
        templateWorkspaceDir: 'test/fixtures/workspace',
    })
    test('Show off v2 features', async ({ page, mitmProxy, vscodeUI, polly, workspaceDir }) => {
        const session = uix.vscode.Session.pending({ page, vscodeUI, workspaceDir })
        polly.server.host(mitmProxy.sourcegraph.dotcom.proxyTarget, () => {
            polly.server
                .post('/.api/graphql')
                .filter(req => 'RecordTelemetryEvents' in req.query)
                .intercept((req, res, interceptor) => {
                    // just to show a custom interceptor in action
                    res.sendStatus(500)
                })
        })
        await uix.workspace.modifySettings(
            existing => ({ ...existing, 'workbench.colorTheme': 'Default Light Modern' }),
            { workspaceDir }
        )

        await session.start()
        await uix.cody.waitForStartup({ page })

        await session.runCommand('workbench.action.closeAllEditors')
        await session.runCommand('workbench.explorer.fileView.focus')

        await page.click('[aria-label="Cody"]')

        await session.runCommand('workbench.explorer.fileView.focus')
        await session.runCommand('workbench.view.extension.cody')

        const [signInView, ...otherWebviews] = await uix.cody.WebView.all({ page }, { atLeast: 1 })

        expect(signInView).toBeTruthy()
        expect(otherWebviews).toHaveLength(0)

        await signInView.waitUntilReady()
        await expect(signInView.wrapper).toBeVisible()

        await expect(
            signInView.content.getByRole('button', { name: 'Sign In to Your Enterprise Instance' })
        ).toBeVisible()
    })
})
