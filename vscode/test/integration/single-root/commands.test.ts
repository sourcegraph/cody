import * as assert from 'assert'

import * as vscode from 'vscode'

import {
    afterIntegrationTest,
    beforeIntegrationTest,
    getTestDocWithCursor,
    getTextEditorWithSelection,
    getTranscript,
    waitUntil,
} from '../helpers'

// This checks the chat messages after submitting a command to make sure it contains
// display text which includes command name and file name
suite('Commands', function () {
    this.beforeEach(beforeIntegrationTest)
    this.afterEach(afterIntegrationTest)
    // regex for /^hello from the assistant$/
    const assistantRegex = /^hello from the assistant$/

    test('Explain Code', async () => {
        await getTextEditorWithSelection()

        // Run the "explain" command
        await vscode.commands.executeCommand('cody.command.explain-code')

        const humanMessage = await getTranscript(0)
        assert.match(humanMessage?.displayText || '', /^Explain/)
        // 2 context files: selection and current file
        assert.equal(humanMessage?.contextFiles?.length, 2)
        await waitUntil(async () => assistantRegex.test((await getTranscript(1)).displayText || ''))
    })

    test('Find Code Smells', async () => {
        await getTextEditorWithSelection()

        // Run the "/smell" command
        await vscode.commands.executeCommand('cody.command.smell-code')

        // Check the chat transcript contains text from prompt
        const humanMessage = await getTranscript(0)
        assert.match(humanMessage.displayText || '', /^Please review and analyze/)
        // 1 context file: selection or visible context
        assert.equal(humanMessage?.contextFiles?.length, 1)

        await waitUntil(async () => assistantRegex.test((await getTranscript(1)).displayText || ''))
    })

    test('Context fetching for Test command', async () => {
        await getTestDocWithCursor()

        // Run the old test command that runs in Chat to
        // check context fetching for all test commands
        await vscode.commands.executeCommand('cody.command.generate-tests')

        // Check the chat transcript contains text from prompt
        const humanMessage = await getTranscript(0)
        assert.match(humanMessage.displayText || '', /^Review the shared code/)

        // Should contains 'buzz.ts' and 'buzz.test.ts'
        assert.ok(humanMessage?.contextFiles?.length === 2)
        for (const message of humanMessage?.contextFiles || []) {
            assert.match(message.uri?.path, /buzz.*ts$/)
        }

        await waitUntil(async () => assistantRegex.test((await getTranscript(1)).displayText || ''))
    })
})
