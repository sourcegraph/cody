import { expect } from '@playwright/test'
import { fixture as test, uix } from './vscody'

test.skip('Sidebar selectors', () => {
    //TODO: We don't use sidebars like this anymore so it's unclear if this helper still will bring value
    test.use({
        templateWorkspaceDir: 'test/fixtures/workspace',
    })
    test('It works', async ({ page, vscodeUI, executeCommand, workspaceDir }) => {
        await uix.vscode.startSession({ page, vscodeUI, executeCommand, workspaceDir })
        const sidebar = uix.vscode.Sidebar.get({ page })

        await executeCommand('workbench.view.explorer')
        expect(await sidebar.isVisible()).toBe(true)
        expect(await sidebar.activeView).toBe('workbench.view.explorer')
        await executeCommand('workbench.action.closeSidebar')
        expect(await sidebar.isVisible()).toBe(false)
        await executeCommand('workbench.view.extension.cody')
        expect(await sidebar.activeView).toBe(uix.vscode.Sidebar.CODY_VIEW_ID)
    })
})

test.describe('Webview Selector', () => {
    test.use({
        templateWorkspaceDir: 'test/fixtures/workspace',
    })

    test('It can handle multiple webviews', async ({ page, vscodeUI, executeCommand, workspaceDir }) => {
        await uix.cody.preAuthenticate({ workspaceDir })
        await uix.vscode.startSession({ page, vscodeUI, executeCommand, workspaceDir })
        await uix.cody.waitForStartup({ page })

        await executeCommand('workbench.view.extension.cody')
        const [sidebarChat] = await uix.cody.WebView.all({ page }, { atLeast: 1 })

        await executeCommand('cody.chat.newEditorPanel')
        const allWebviews = await uix.cody.WebView.all({ page }, { atLeast: 2 })

        const [editorChat] = await uix.cody.WebView.all(
            { page },
            { atLeast: 1, ignoring: [sidebarChat] }
        )

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
