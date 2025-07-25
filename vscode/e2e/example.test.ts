import { expect } from '@playwright/test'
import { fixture as test, uix } from './utils/vscody'

test.describe('Demonstrations', () => {
    test.use({
        templateWorkspaceDir: 'test/fixtures/legacy-polyglot-template',
    })
    test('Show off v2 features', async ({
        page,
        mitmProxy,
        vscodeUI,
        polly,
        workspaceDir,
    }, testInof) => {
        const session = uix.vscode.Session.pending({ page, vscodeUI, workspaceDir })
        const cody = uix.cody.Extension.with({ page, workspaceDir })

        polly.server.host(mitmProxy.sourcegraph.enterprise.proxyTarget, () => {
            polly.server
                .post('/.api/graphql')
                .filter(req => 'RecordTelemetryEvents' in req.query)
                .intercept((req, res, interceptor) => {
                    // just to show a custom interceptor in action
                    res.sendStatus(500)
                })
        })
        await uix.workspace.modifySettings(
            existing => ({
                ...existing,
                'workbench.colorTheme': 'Default Light Modern',
                // 'cody.override.authToken': MITM_AUTH_TOKEN_PLACEHOLDER,
                // 'cody.override.serverEndpoint': mitmProxy.sourcegraph.enterprise.endpoint,
            }),
            { workspaceDir }
        )

        await session.start()
        await cody.waitUntilReady()

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

        await expect(signInView.content.getByText('Sign in to Sourcegraph')).toBeVisible()
    })
})
