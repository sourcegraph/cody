import { expect } from '@playwright/test'
import { fixture as test, uix } from './vscody'

test.describe('Sidebar selectors', () => {
    //TODO: We don't use sidebars like this anymore so it's unclear if this helper still will bring value
    test.use({
        templateWorkspaceDir: 'test/fixtures/legacy-polyglot-template',
    })
    test('It works', async ({ page, vscodeUI, workspaceDir, polly, mitmProxy }) => {
        const { vsc } = await uix.vscode.Session.startWithCody(
            { page, vscodeUI, workspaceDir, polly },
            { codyEndpoint: mitmProxy.sourcegraph.dotcom.endpoint, preAuthenticateCody: false }
        )
        const sidebar = vsc.Sidebar

        await vsc.runCommand('workbench.view.explorer')
        await sidebar.expect.toBeVisible()
        await sidebar.expect.toHaveActiveView({ id: 'workbench.view.explorer' })
        await vsc.runCommand('workbench.action.closeSidebar')
        await sidebar.expect.toBeHidden()
        await vsc.runCommand('workbench.view.extension.cody')
        await sidebar.expect.toHaveActiveView('cody')
    })
})

test.describe('Webview Selector', () => {
    test.use({
        templateWorkspaceDir: 'test/fixtures/legacy-polyglot-template',
    })

    test('It can handle multiple webviews', async ({
        page,
        vscodeUI,
        workspaceDir,
        mitmProxy,
        polly,
    }) => {
        const { vsc } = await uix.vscode.Session.startWithCody(
            { page, vscodeUI, workspaceDir, polly },
            { codyEndpoint: mitmProxy.sourcegraph.dotcom.endpoint }
        )

        await vsc.runCommand('workbench.view.extension.cody')
        const [sidebarChat] = await uix.cody.WebView.all(vsc, { atLeast: 1 })
        await sidebarChat.waitUntilReady()

        await vsc.runCommand('cody.chat.newEditorPanel')
        const allWebviews = await uix.cody.WebView.all(vsc, { atLeast: 2 })

        const [editorChat] = await uix.cody.WebView.all(vsc, { atLeast: 1, ignoring: [sidebarChat] })

        expect(allWebviews).toHaveLength(2)
        expect(allWebviews).toContainEqual(sidebarChat)
        expect(allWebviews).toContainEqual(editorChat)
    })
})

test.describe('Workspace', () => {
    test.use({
        templateWorkspaceDir: 'test/fixtures/legacy-polyglot-template',
    })

    test('It can initialize a git repository', async ({ workspaceDir }) => {
        await uix.workspace.gitInit(
            {
                origin: 'https://github.com/sourcegraph/cody',
            },
            { workspaceDir }
        )
    })
})
