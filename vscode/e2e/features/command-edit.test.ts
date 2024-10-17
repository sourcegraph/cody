import { expect } from '@playwright/test'
import { stretchTimeout } from '../utils/helpers'
import { fixture as test, uix } from '../utils/vscody'

test.use({
    templateWorkspaceDir: 'test/fixtures/legacy-polyglot-template',
})

const DEFAULT_EDIT_MODEL = 'Claude 3.5 Sonnet'

test.describe('edit command', {}, () => {
    test('can be started from sidebar', async ({ workspaceDir, page, vscodeUI, mitmProxy, polly }) => {
        const { vsc } = await uix.vscode.Session.startWithCody(
            { page, vscodeUI, workspaceDir, polly },
            { codyEndpoint: mitmProxy.sourcegraph.dotcom.endpoint }
        )

        await vsc.editor.openFile({ workspaceFile: 'type.ts', selection: { line: 2, col: 9 } })

        await test.step('sidebar ui can start an edit', async () => {
            await vsc.runCommand('workbench.view.extension.cody')
            const [codySidebar] = await uix.cody.WebView.all({ page }, { atLeast: 1 })
            await codySidebar.waitUntilReady()
            await codySidebar.content.getByTestId('tab-prompts').click()
            await codySidebar.content.locator(`div[data-value="command-edit"]`).click()

            // check that we're seeing the correct quickPick
            await Promise.all([
                expect(vsc.QuickPick.locator).toBeVisible(),
                expect(vsc.QuickPick.title).toHaveText(/^Edit .* with Cody$/, { ignoreCase: true }),
            ])

            // Dismiss after we're done. We'll be using the command directly to test it's function.
            await vsc.QuickPick.dismiss()
            await expect(vsc.QuickPick.locator).toBeHidden()
        })
    })

    test('can be rejected', async ({ workspaceDir, page, vscodeUI, mitmProxy, polly }, testInfo) => {
        const { vsc } = await uix.vscode.Session.startWithCody(
            { page, vscodeUI, workspaceDir, polly },
            { codyEndpoint: mitmProxy.sourcegraph.dotcom.endpoint }
        )
        await vsc.editor.openFile({ workspaceFile: 'type.ts', selection: { line: 2, col: 9 } })

        await vsc.runCommand({ command: 'cody.command.edit-code', skipResult: true })
        await vsc.QuickPick.input.fill('Replace apple with banana', { force: true })
        await vsc.QuickPick.items({ hasText: /Submit/ }).click()

        const workingLens = vsc.editor.active.getByRole('button', { name: 'Cody is working...' })
        await stretchTimeout(
            async () => {
                expect(workingLens).not.toBeVisible() // we wait for the command to settle
            },
            { max: 10000, testInfo }
        )

        const retryLens = vsc.editor.active.getByRole('button', { name: 'Edit & Retry' })
        const acceptLens = vsc.editor.active.getByRole('button', { name: 'Accept' })
        const rejectLens = vsc.editor.active.getByRole('button', { name: 'Reject' })
        await Promise.all([
            expect(retryLens).toBeVisible(),
            expect(rejectLens).toBeVisible(),
            expect(acceptLens).toBeVisible(),
        ])

        await Promise.all([
            expect(vsc.editor.active.getByText('appleName')).not.toBeVisible(),
            expect(vsc.editor.active.getByText('bananaName')).toBeVisible(),
        ])
        await rejectLens.click()
        await Promise.all([
            expect(retryLens).not.toBeVisible(),
            expect(rejectLens).not.toBeVisible(),
            expect(acceptLens).not.toBeVisible(),
        ])
        await Promise.all([
            expect(vsc.editor.active.getByText('appleName')).toBeVisible(),
            expect(vsc.editor.active.getByText('bananaName')).not.toBeVisible(),
        ])
    })

    test('can be accepted', async ({ workspaceDir, page, vscodeUI, mitmProxy, polly }, testInfo) => {
        const { vsc } = await uix.vscode.Session.startWithCody(
            { page, vscodeUI, workspaceDir, polly },
            { codyEndpoint: mitmProxy.sourcegraph.dotcom.endpoint }
        )

        await vsc.editor.openFile({ workspaceFile: 'type.ts', selection: { line: 2, col: 9 } })

        await vsc.runCommand({ command: 'cody.command.edit-code', skipResult: true })
        await vsc.QuickPick.input.fill('Replace apple with banana', { force: true })
        await vsc.QuickPick.items({ hasText: /Submit/ }).click()

        const workingLens = vsc.editor.active.getByRole('button', { name: 'Cody is working...' })
        await stretchTimeout(
            () => expect(workingLens).not.toBeVisible(), // we wait for the command to settle
            { max: 10000, testInfo }
        )

        const retryLens = vsc.editor.active.getByRole('button', { name: 'Edit & Retry' })
        const acceptLens = vsc.editor.active.getByRole('button', { name: 'Accept' })
        const rejectLens = vsc.editor.active.getByRole('button', { name: 'Reject' })
        await Promise.all([
            expect(retryLens).toBeVisible(),
            expect(rejectLens).toBeVisible(),
            expect(acceptLens).toBeVisible(),
        ])

        await Promise.all([
            expect(vsc.editor.active.getByText('appleName')).not.toBeVisible(),
            expect(vsc.editor.active.getByText('bananaName')).toBeVisible(),
        ])
        await rejectLens.click()
        await Promise.all([
            expect(retryLens).not.toBeVisible(),
            expect(rejectLens).not.toBeVisible(),
            expect(acceptLens).not.toBeVisible(),
        ])
        await Promise.all([
            expect(vsc.editor.active.getByText('appleName')).toBeVisible(),
            expect(vsc.editor.active.getByText('bananaName')).not.toBeVisible(),
        ])
    })

    test('can change edit ranges', async ({
        workspaceDir,
        page,
        vscodeUI,
        mitmProxy,
        polly,
        context,
    }, testInfo) => {
        const { vsc } = await uix.vscode.Session.startWithCody(
            { page, vscodeUI, workspaceDir, polly },
            { codyEndpoint: mitmProxy.sourcegraph.dotcom.endpoint }
        )

        const selectionStatus = vsc.StatusBarItems.editorSelection
        await vsc.editor.openFile({
            workspaceFile: 'type.ts',
            selection: { start: { line: 2, col: 1 }, end: { line: 3, col: 1 } },
        })
        await expect(selectionStatus).toHaveText('Ln 3, Col 1 (22 selected)')

        await vsc.runCommand({ command: 'cody.command.edit-code', skipResult: true })

        // TODO: There seems to be some flake because the document isn't indexed yet?
        // Just run this test with retry-each 10 and about 10% should fail.
        await vsc.QuickPick.items({ hasText: /Range/ }).click()
        await vsc.QuickPick.items({ hasText: /Selection/ }).click()
        await expect(selectionStatus).toHaveText('Ln 3, Col 21 (38 selected)')

        // We now change to code-block
        await vsc.QuickPick.items({ hasText: /Range/ }).click()
        await vsc.QuickPick.items({ hasText: /Nearest Code Block/ }).click()
        await expect(vsc.QuickPick.items({ hasText: /Range/ })).toBeVisible() // this indicates we've handled the click
        await expect(selectionStatus).toHaveText('Ln 4, Col 2 (62 selected)')
    })

    // TODO: For some reason this has been disabled
    test('can switch models', async ({ workspaceDir, page, vscodeUI, mitmProxy, polly }) => {
        const { vsc } = await uix.vscode.Session.startWithCody(
            { page, vscodeUI, workspaceDir, polly },
            { codyEndpoint: mitmProxy.sourcegraph.dotcom.endpoint }
        )

        await vsc.editor.openFile({
            workspaceFile: 'type.ts',
            selection: { line: 2, col: 9 },
        })

        await vsc.runCommand({ command: 'cody.command.edit-code', skipResult: true })
        // Check default model is selected
        await expect(await vsc.QuickPick.items({ hasText: /Model/ })).toContainText(DEFAULT_EDIT_MODEL)
        // Then switch models
        await vsc.QuickPick.items({ hasText: /Model/ }).click()
        await vsc.QuickPick.items({ hasNotText: DEFAULT_EDIT_MODEL }).first().click()
        await expect(vsc.QuickPick.items({ hasText: /Range/ })).toBeVisible()
        await expect(await vsc.QuickPick.items({ hasText: /Model/ })).not.toContainText(
            DEFAULT_EDIT_MODEL
        )

        // Re-opening should have kept the previously selected model
        await vsc.QuickPick.dismiss()
        await vsc.runCommand({ command: 'cody.command.edit-code', skipResult: true })
        await expect(await vsc.QuickPick.items({ hasText: /Model/ })).not.toContainText(
            DEFAULT_EDIT_MODEL
        )
    })
})
