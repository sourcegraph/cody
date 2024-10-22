import { expect } from '@playwright/test'
import { produce } from 'immer'
import { fixture as test, uix } from '../utils/vscody'
test.use({
    templateWorkspaceDir: 'test/fixtures/legacy-polyglot-template',
})

test.describe('support menu', {}, () => {
    test('free users can open support menu', async ({
        workspaceDir,
        page,
        vscodeUI,
        mitmProxy,
        polly,
        context,
    }, testInfo) => {
        polly.server.host(mitmProxy.sourcegraph.dotcom.proxyTarget, () => {
            polly.server
                .post('/.api/graphql')
                .filter(req => 'CurrentUserCodySubscription' in req.query)
                .on('beforeResponse', (req, res, event) => {
                    const data = res.jsonBody()
                    const patchedData = produce(data, (draft: any) => {
                        const sub = draft?.data?.currentUser?.codySubscription
                        if (sub) {
                            sub.applyProRateLimits = false
                            sub.plan = 'FREE'
                        }
                        return draft
                    })
                    res.send(patchedData)
                })
        })

        const { vsc } = await uix.vscode.Session.startWithCody(
            { page, vscodeUI, workspaceDir, polly },
            { codyEndpoint: mitmProxy.sourcegraph.dotcom.endpoint }
        )

        await vsc.StatusBarItems.cody.locator.click()

        await expect(vsc.QuickPick.title).toHaveText('Cody Settings')

        const support = vsc.QuickPick.items({ hasText: /Cody Support/ })
        await support.scrollIntoViewIfNeeded()
        await expect(support).toBeVisible()
    })

    test('pro users can open support menu', async ({
        workspaceDir,
        page,
        vscodeUI,
        mitmProxy,
        polly,
    }) => {
        const { vsc } = await uix.vscode.Session.startWithCody(
            { page, vscodeUI, workspaceDir, polly },
            { codyEndpoint: mitmProxy.sourcegraph.dotcom.endpoint }
        )

        await vsc.StatusBarItems.cody.locator.click()

        await expect(vsc.QuickPick.title).toHaveText('Cody Settings')

        const support = vsc.QuickPick.items({ hasText: /Cody Support/ })
        await support.scrollIntoViewIfNeeded()
        await expect(support).toBeVisible()
    })
})
