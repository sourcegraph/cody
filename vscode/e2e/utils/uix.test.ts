import { expect } from '@playwright/test'
import { fixture as test, uix } from './vscody'

test.describe('UIX', () => {
    test.use({
        templateWorkspaceDir: 'test/fixtures/workspace',
    })
    test('VSCode Sidebar', async ({ page, vscodeUI, executeCommand, workspaceDir }) => {
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
