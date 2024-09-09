import { type TestDetails, expect } from '@playwright/test'
import { Annotations } from '../utils/test-info'
import { fixture as test, uix } from '../utils/vscody'
import { MITM_AUTH_TOKEN_PLACEHOLDER } from '../utils/vscody/constants'
import { modifySettings } from '../utils/vscody/uix/workspace'

const DECORATION_SELECTOR =
    'div.view-overlays[role="presentation"] div[class*="TextEditorDecorationType"]'

const testDetails: TestDetails = {
    annotation: [{ type: Annotations.Feature, description: 'update notices' }],
}

test.use({
    templateWorkspaceDir: 'test/fixtures/workspace',
})

test.describe('fixup decorator', testDetails, () => {
    test('decorations from un-applied Cody changes appear', async ({
        workspaceDir,
        page,
        vscodeUI,
        mitmProxy,
    }) => {
        const session = uix.vscode.Session.pending({ page, vscodeUI, workspaceDir })
        const cody = uix.cody.Extension.with({ page, workspaceDir })

        await test.step('setup', async () => {
            await modifySettings(
                s => ({
                    ...s,
                    'cody.accessToken': MITM_AUTH_TOKEN_PLACEHOLDER,
                    'cody.serverEndpoint': mitmProxy.sourcegraph.dotcom.endpoint,
                }),
                { workspaceDir }
            )
            await session.start()
            await cody.waitUntilReady()
            await session.editor.openFile({ workspaceFile: 'index.html' })
        })

        const decorations = page.locator(DECORATION_SELECTOR)
        await expect(page.getByText('<title>Hello Cody</title>')).toBeVisible()
        await expect(decorations).toHaveCount(0)

        await test.step('trigger decorations with edit', async () => {
            await session.editor.select({
                selection: { start: { line: 7 }, end: { line: 7, col: 9999 } },
            })
            // we need to skip the command result here because the edit command doesn't immediately resolve
            await session.runCommand({ command: 'cody.command.edit-code', skipResult: true })
            await session.QuickPick.input.fill('Replace hello with goodbeye', { force: true })
            const submit = session.QuickPick.items({ hasText: /Submit/ })
            await expect(submit).toBeVisible()
            await submit.click()
        })

        await expect(decorations.first()).toBeVisible()
        const decorationClassName = (await decorations.first().getAttribute('class'))
            ?.split(' ')
            .find(className => className.includes('TextEditorDecorationType'))
        expect(decorationClassName).toBeDefined()

        await test.step('modify and navigate text to invalidate decorations', async () => {
            await session.editor.active.pressSequentially('Hello World')
            await session.editor.active.press('ArrowRight')
        })

        //TODO(rnauta): I don't think this tests what was expected and it's also flaky. Follow up with @dominiccooney what the intent was.
        // await expect(
        //     page.locator(`${DECORATION_SELECTOR}:not([class*="${decorationClassName}"])`).first()
        // ).toBeVisible()
    })
})
