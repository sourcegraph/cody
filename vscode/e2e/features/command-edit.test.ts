import { expect } from '@playwright/test'
import { stretchTimeout } from '../utils/helpers'
import { fixture as test, uix } from '../utils/vscody'

test.use({
    templateWorkspaceDir: 'test/fixtures/workspace',
})

const DEFAULT_EDIT_MODEL = 'Claude 3.5 Sonnet'

test.describe('edit command', {}, () => {
    test('can be started from sidebar', async ({ workspaceDir, page, vscodeUI }) => {
        const session = uix.vscode.Session.pending({ page, vscodeUI, workspaceDir })
        await test.step('setup', async () => {
            await uix.cody.preAuthenticate({ workspaceDir })
            await session.start()
            await uix.cody.waitForStartup({ page })
            await session.editor.openFile({ workspaceFile: 'type.ts', selection: { line: 2, col: 9 } })
        })

        await test.step('sidebar ui can start an edit', async () => {
            await session.runCommand('workbench.view.extension.cody')
            const [codySidebar] = await uix.cody.WebView.all({ page }, { atLeast: 1 })
            await codySidebar.waitUntilReady()
            await codySidebar.content.getByTestId('tab-prompts').click()
            await codySidebar.content.locator(`div[data-value="command-edit"]`).click()

            // check that we're seeing the correct quickPick
            await Promise.all([
                expect(session.QuickPick.locator).toBeVisible(),
                expect(session.QuickPick.title).toHaveText(/^Edit .* with Cody$/, { ignoreCase: true }),
            ])

            // Dismiss after we're done. We'll be using the command directly to test it's function.
            await session.QuickPick.dismiss()
            await expect(session.QuickPick.locator).toBeHidden()
        })
    })

    test('can be rejected', async ({ workspaceDir, page, vscodeUI, mitmProxy }, testInfo) => {
        const session = uix.vscode.Session.pending({ page, vscodeUI, workspaceDir })
        await test.step('setup', async () => {
            await uix.cody.preAuthenticate({ workspaceDir })
            await session.start()
            await uix.cody.waitForStartup({ page })
            await session.editor.openFile({ workspaceFile: 'type.ts', selection: { line: 2, col: 9 } })
        })

        await session.runCommand({ command: 'cody.command.edit-code', skipResult: true })
        await session.QuickPick.input.fill('Replace apple with banana', { force: true })
        await session.QuickPick.items({ hasText: /Submit/ }).click()

        const workingLens = session.editor.active.getByRole('button', { name: 'Cody is working...' })
        await stretchTimeout(
            async () => {
                expect(workingLens).not.toBeVisible() // we wait for the command to settle
            },
            { max: 10000, testInfo }
        )

        const retryLens = session.editor.active.getByRole('button', { name: 'Edit & Retry' })
        const acceptLens = session.editor.active.getByRole('button', { name: 'Accept' })
        const rejectLens = session.editor.active.getByRole('button', { name: 'Reject' })
        await Promise.all([
            expect(retryLens).toBeVisible(),
            expect(rejectLens).toBeVisible(),
            expect(acceptLens).toBeVisible(),
        ])

        await Promise.all([
            expect(session.editor.active.getByText('appleName')).not.toBeVisible(),
            expect(session.editor.active.getByText('bananaName')).toBeVisible(),
        ])
        await rejectLens.click()
        await Promise.all([
            expect(retryLens).not.toBeVisible(),
            expect(rejectLens).not.toBeVisible(),
            expect(acceptLens).not.toBeVisible(),
        ])
        await Promise.all([
            expect(session.editor.active.getByText('appleName')).toBeVisible(),
            expect(session.editor.active.getByText('bananaName')).not.toBeVisible(),
        ])
    })

    test('can be accepted', async ({ workspaceDir, page, vscodeUI, mitmProxy }, testInfo) => {
        const session = uix.vscode.Session.pending({ page, vscodeUI, workspaceDir })
        await test.step('setup', async () => {
            await uix.cody.preAuthenticate({ workspaceDir })
            await session.start()
            await uix.cody.waitForStartup({ page })
            await session.editor.openFile({ workspaceFile: 'type.ts', selection: { line: 2, col: 9 } })
        })

        await session.runCommand({ command: 'cody.command.edit-code', skipResult: true })
        await session.QuickPick.input.fill('Replace apple with banana', { force: true })
        await session.QuickPick.items({ hasText: /Submit/ }).click()

        const workingLens = session.editor.active.getByRole('button', { name: 'Cody is working...' })
        await stretchTimeout(
            async () => {
                expect(workingLens).not.toBeVisible() // we wait for the command to settle
            },
            { max: 10000, testInfo }
        )

        const retryLens = session.editor.active.getByRole('button', { name: 'Edit & Retry' })
        const acceptLens = session.editor.active.getByRole('button', { name: 'Accept' })
        const rejectLens = session.editor.active.getByRole('button', { name: 'Reject' })
        await Promise.all([
            expect(retryLens).toBeVisible(),
            expect(rejectLens).toBeVisible(),
            expect(acceptLens).toBeVisible(),
        ])

        await Promise.all([
            expect(session.editor.active.getByText('appleName')).not.toBeVisible(),
            expect(session.editor.active.getByText('bananaName')).toBeVisible(),
        ])
        await rejectLens.click()
        await Promise.all([
            expect(retryLens).not.toBeVisible(),
            expect(rejectLens).not.toBeVisible(),
            expect(acceptLens).not.toBeVisible(),
        ])
        await Promise.all([
            expect(session.editor.active.getByText('appleName')).toBeVisible(),
            expect(session.editor.active.getByText('bananaName')).not.toBeVisible(),
        ])
    })

    test('can change edit ranges', async ({ workspaceDir, page, vscodeUI, mitmProxy }, testInfo) => {
        const session = uix.vscode.Session.pending({ page, vscodeUI, workspaceDir })
        await test.step('setup', async () => {
            await uix.cody.preAuthenticate({ workspaceDir })
            await session.start()
            await uix.cody.waitForStartup({ page })
            await session.editor.openFile({
                workspaceFile: 'type.ts',
                selection: { start: { line: 2 }, end: { line: 3 } },
            })
        })

        await session.runCommand({ command: 'cody.command.edit-code', skipResult: true })

        await session.QuickPick.items({ hasText: /Range/ }).click()
        await session.QuickPick.items({ hasText: /Selection/ }).click()

        const getSelection = () =>
            session.runMacro(async function () {
                // get the current active selection range
                const res = this.vscode.window.activeTextEditor?.selection
                return {
                    startLine: (res?.start.line ?? 0) + 1,
                    startCol: (res?.start.character ?? 0) + 1,
                    endLine: (res?.end.line ?? 0) + 1,
                    endCol: (res?.end.character ?? 0) + 1,
                }
            }, [])

        expect(await getSelection()).toEqual({
            startLine: 2,
            startCol: 5,
            endLine: 3,
            endCol: 21,
        })

        // We now change to code-block
        await session.QuickPick.items({ hasText: /Range/ }).click()
        await session.QuickPick.items({ hasText: /Nearest Code Block/ }).click()
        await expect(session.QuickPick.items({ hasText: /Range/ })).toBeVisible() // this indicates we've handled the click
        await expect(await getSelection()).toEqual({
            startLine: 1,
            startCol: 1,
            endLine: 4,
            endCol: 2,
        })
    })

    test('can switch models', async ({ workspaceDir, page, vscodeUI }) => {
        const session = uix.vscode.Session.pending({ page, vscodeUI, workspaceDir })
        await test.step('setup', async () => {
            await uix.cody.preAuthenticate({ workspaceDir })
            await session.start()
            await uix.cody.waitForStartup({ page })
            await session.editor.openFile({
                workspaceFile: 'type.ts',
                selection: { line: 2, col: 9 },
            })
        })

        await session.runCommand({ command: 'cody.command.edit-code', skipResult: true })
        // Check default model is selected
        await expect(await session.QuickPick.items({ hasText: /Model/ })).toContainText(
            DEFAULT_EDIT_MODEL
        )
        // Then switch models
        await session.QuickPick.items({ hasText: /Model/ }).click()
        await session.QuickPick.items({ hasNotText: DEFAULT_EDIT_MODEL }).first().click()
        await expect(session.QuickPick.items({ hasText: /Range/ })).toBeVisible()
        await expect(await session.QuickPick.items({ hasText: /Model/ })).not.toContainText(
            DEFAULT_EDIT_MODEL
        )

        // Re-opening should have kept the previously selected model
        await session.QuickPick.dismiss()
        await session.runCommand({ command: 'cody.command.edit-code', skipResult: true })
        await expect(await session.QuickPick.items({ hasText: /Model/ })).not.toContainText(
            DEFAULT_EDIT_MODEL
        )
    })
})
