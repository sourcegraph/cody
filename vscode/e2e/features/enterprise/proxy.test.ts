// import { writeFile } from 'node:fs/promises'
// import path from 'node:path'
// import { expect } from '@playwright/test'
import { expect } from 'playwright/test'
import { fixture as test, uix } from '../../utils/vscody'
import { MITM_AUTH_TOKEN_PLACEHOLDER } from '../../utils/vscody/constants'

test.use({
    templateWorkspaceDir: 'test/fixtures/legacy-polyglot-template',
    codyEnvVariables: {
        // We set this back to an unproxied endpoint so that we can test the proxy functionality
        CODY_OVERRIDE_DOTCOM_URL: 'https://sourcegraph.com/',
    },
})

test.describe('proxy configuration', {}, () => {
    //TODO: implement actual mitmweb to automatically test proxy configurations

    test.describe('shows errors on misconfiguration', () => {
        test('broken server', async ({ page, vscodeUI, workspaceDir, mitmProxy, polly }, testInfo) => {
            const vsc = uix.vscode.Session.pending({ page, vscodeUI, workspaceDir, polly })
            const cody = uix.cody.Extension.with({ page, workspaceDir })

            // when a proxy doesn't work we expect Cody to show errors
            await uix.workspace.modifySettings(
                s => ({
                    ...s,
                    'cody.net.proxy': { server: 'https://127.0.0.1:1010' },
                    'cody.override.authToken': MITM_AUTH_TOKEN_PLACEHOLDER,
                }),
                { workspaceDir }
            )
            await vsc.start()
            await cody.waitUntilReady({ hasErrors: true, isAuthenticated: false })

            // we expect changes in settings to automatically resolve the issue
            mitmProxy.sourcegraph.enterprise.authName = 'enterprise'
            await uix.workspace.modifySettings(
                s => ({
                    ...s,
                    'cody.net.proxy': undefined,
                    'cody.override.authToken': MITM_AUTH_TOKEN_PLACEHOLDER,
                    'cody.override.serverEndpoint': mitmProxy.sourcegraph.enterprise.endpoint,
                }),
                { workspaceDir }
            )

            const workingStatus = cody.statusBarItem.withTags({
                loading: false,
                hasErrors: false,
                isAuthenticated: true,
            })
            await expect(workingStatus).toBeVisible({ visible: true })
        })
    })
})
