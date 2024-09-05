import { expect } from '@playwright/test'
import { fixture as test, uix } from './vscody'

test.describe('Sidebar selectors', () => {
    //TODO: We don't use sidebars like this anymore so it's unclear if this helper still will bring value
    test.use({
        templateWorkspaceDir: 'test/fixtures/workspace',
    })
    test('It works', async ({ page, vscodeUI, workspaceDir }) => {
        const session = await uix.vscode.Session.pending({ page, vscodeUI, workspaceDir }).start()
        const sidebar = session.Sidebar

        await session.runCommand('workbench.view.explorer')
        await sidebar.expect.toBeVisible()
        await sidebar.expect.toHaveActiveView({ id: 'workbench.view.explorer' })
        await session.runCommand('workbench.action.closeSidebar')
        await sidebar.expect.toBeHidden()
        await session.runCommand('workbench.view.extension.cody')
        await sidebar.expect.toHaveActiveView('cody')
    })
})

test.describe('Webview Selector', () => {
    test.use({
        templateWorkspaceDir: 'test/fixtures/workspace',
    })

    test('It can handle multiple webviews', async ({ page, vscodeUI, workspaceDir }) => {
        await uix.cody.preAuthenticate({ workspaceDir })
        const session = await uix.vscode.Session.pending({ page, vscodeUI, workspaceDir }).start()
        await uix.cody.waitForStartup({ page })

        await session.runCommand('workbench.view.extension.cody')
        const [sidebarChat] = await uix.cody.WebView.all(session, { atLeast: 1 })

        await session.runCommand('cody.chat.newEditorPanel')
        const allWebviews = await uix.cody.WebView.all(session, { atLeast: 2 })

        const [editorChat] = await uix.cody.WebView.all(session, { atLeast: 1, ignoring: [sidebarChat] })

        expect(allWebviews).toHaveLength(2)
        expect(allWebviews).toContainEqual(sidebarChat)
        expect(allWebviews).toContainEqual(editorChat)
    })
})

test.describe('Workspace', () => {
    test.use({
        templateWorkspaceDir: 'test/fixtures/workspace',
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
