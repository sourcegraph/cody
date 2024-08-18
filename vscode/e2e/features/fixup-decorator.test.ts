import { type TestDetails, expect } from '@playwright/test'
import { Annotations } from '../utils/test-info'
import { fixture as test, uix } from '../utils/vscody'
import { activeEditor, idx } from '../utils/vscody/uix/vscode'

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
        executeCommand,
        mitmProxy,
    }) => {
        await test.step('setup', async () => {
            await uix.cody.preAuthenticate({ workspaceDir })
            await uix.vscode.startSession({ page, vscodeUI, executeCommand, workspaceDir })
            await uix.cody.waitForStartup({ page })
            await uix.vscode.openFile({ workspaceFile: 'index.html' }, { executeCommand })
        })

        const decorations = page.locator(DECORATION_SELECTOR)
        await expect(page.getByText('<title>Hello Cody</title>')).toBeVisible()
        await expect(decorations).toHaveCount(0)

        await test.step('trigger decorations with edit', async () => {
            await uix.vscode.select(
                { selection: { start: { line: idx(7) }, end: { line: idx(7), character: idx(9999) } } },
                { executeCommand }
            )
            await page.getByRole('button', { name: 'Cody Commands' }).click()
            await page.getByRole('option', { name: 'Edit code' }).first().click()
            await page
                .locator('input[aria-describedby="quickInput_message"]')
                .fill('Replace hello with goodbeye', { force: true })
            await page.keyboard.press('Enter')
        })

        await expect(decorations.first()).toBeVisible()
        const decorationClassName = (await decorations.first().getAttribute('class'))
            ?.split(' ')
            .find(className => className.includes('TextEditorDecorationType'))
        expect(decorationClassName).toBeDefined()

        await test.step('modify and navigate text to invalidate decorations', async () => {
            await activeEditor({ page }).pressSequentially('Hello World')
            await activeEditor({ page }).press('ArrowRight')
        })

        //TODO(rnauta): I don't think this tests what was expected and it's also flaky. Follow up with @dominiccooney what the intent was.
        // await expect(
        //     page.locator(`${DECORATION_SELECTOR}:not([class*="${decorationClassName}"])`).first()
        // ).toBeVisible()
    })
})
