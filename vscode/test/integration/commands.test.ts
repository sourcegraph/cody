import * as assert from 'assert'

import * as vscode from 'vscode'

import { afterIntegrationTest, beforeIntegrationTest, getTranscript, waitUntil } from './helpers'

// TODO update tests to work with new simple chat

suite('Commands', function () {
    this.beforeEach(beforeIntegrationTest)
    this.afterEach(afterIntegrationTest)

    async function getTextEditorWithSelection(): Promise<void> {
        // Open Main.java
        assert.ok(vscode.workspace.workspaceFolders)
        const mainJavaUri = vscode.Uri.parse(`${vscode.workspace.workspaceFolders[0].uri.toString()}/Main.java`)
        const textEditor = await vscode.window.showTextDocument(mainJavaUri)

        // Select the "main" method
        textEditor.selection = new vscode.Selection(5, 0, 7, 0)
    }

    // regex for /^hello from the assistant$/
    const assistantRegex = /^hello from the assistant$/

    test.skip('Explain Code', async () => {
        await getTextEditorWithSelection()

        // Run the "explain" command
        await vscode.commands.executeCommand('cody.command.explain-code')

        // Check the chat transcript contains text from prompt
        assert.match((await getTranscript(0)).displayText || '', /\/explain/)
        await waitUntil(async () => assistantRegex.test((await getTranscript(1)).displayText || ''))
    })

    test.skip('Find Code Smells', async () => {
        await getTextEditorWithSelection()

        // Run the "/smell" command
        await vscode.commands.executeCommand('cody.command.smell-code')

        // Check the chat transcript contains text from prompt
        const humanMessage = await getTranscript(0)
        assert.match(humanMessage.displayText || '', /\/smell/)

        await waitUntil(async () => assistantRegex.test((await getTranscript(1)).displayText || ''))
    })

    test.skip('Generate Unit Tests', async () => {
        await getTextEditorWithSelection()

        // Run the "/test" command
        await vscode.commands.executeCommand('cody.command.generate-tests')

        // Check the chat transcript contains text from prompt
        const humanMessage = await getTranscript(0)
        assert.match(humanMessage.displayText || '', /\/unit test/)

        await waitUntil(async () => assistantRegex.test((await getTranscript(1)).displayText || ''))
    })
})
