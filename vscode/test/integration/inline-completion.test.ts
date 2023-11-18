import * as assert from 'assert'

import * as vscode from 'vscode'

import * as mockServer from '../fixtures/mock-server'

import { afterIntegrationTest, beforeIntegrationTest, getExtensionAPI } from './helpers'

suite('Inline Completion', function () {
    this.beforeEach(() => beforeIntegrationTest())
    this.afterEach(() => afterIntegrationTest())

    assert.ok(vscode.workspace.workspaceFolders)
    const indexUri = vscode.Uri.parse(`${vscode.workspace.workspaceFolders[0].uri.toString()}/index.html`)

    suite.only('rate limit errors', () => {
        async function delay(ms: number) {
            await new Promise(resolve => setTimeout(resolve, ms))
        }

        async function triggerInlineCompletionRateLimit() {
            await fetch(`${mockServer.SERVER_URL}/.api/completions/code/triggerRateLimit`, {
                method: 'POST',
            })
        }

        async function triggerInlineCompletion() {
            const editor = await vscode.window.showTextDocument(indexUri)
            await editor.edit(editBuilder => {
                editBuilder.replace(
                    new vscode.Range(
                        editor.document.positionAt(0),
                        editor.document.positionAt(editor.document.getText().length)
                    ),
                    '<body>\n\n</body>'
                )
            })
            editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0))

            await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger')
        }

        function getStatusBarErrors() {
            return getExtensionAPI().exports.testing!.statusBar!.errors
        }

        function clearStatusBarErrors() {
            getExtensionAPI().exports.testing!.statusBar!.errors.length = 0
        }

        this.beforeEach(() => clearStatusBarErrors())

        test('does not trigger error if not over rate limit', async () => {
            await triggerInlineCompletion()
            await delay(100)

            const errors = getStatusBarErrors()
            assert.equal(errors.length, 0)
        })

        test('triggers standard message if over limit', async () => {
            await triggerInlineCompletionRateLimit()
            await triggerInlineCompletion()
            await delay(100)

            const errors = getStatusBarErrors()
            assert.equal(errors.length, 1)
            assert.equal(errors[0].error.title, 'Cody Autocomplete Disabled Due to Rate Limit')
            assert.equal(
                errors[0].error.description,
                "You've used all 12345 daily autocompletions. Usage will reset in less than a minute."
            )
        })

        // TODO(dantup): We need to be able to simulate dotcom auth here, because upgrade
        //  messages are never shown to non-dotCom and currently auth for tests is treated
        //  as not dotCom (by the `if (!isDotComOrApp)` condition in `vscode\src\services\AuthProvider.ts`
        //
        //  If we change that path to `isDotComOrAppOrTest` it would potentially change behaviour of
        //  other tests that are currently all considered _not_ dotComOrApp.
        test.skip('triggers upgrade message if over limit and upgrade is available', async () => {
            // TODO(dantup): Set GA feature flag for all tests
            await triggerInlineCompletionRateLimit()
            await triggerInlineCompletion()
            await delay(100)

            const errors = getStatusBarErrors()
            assert.equal(errors.length, 1)
            assert.equal(errors[0].error.title, 'Upgrade to Continue Using Cody Autocomplete')
            assert.equal(
                errors[0].error.description,
                "You've used all 12345 daily autocompletions. Usage will reset in less than a minute."
            )
        })
    })
})
