import * as assert from 'assert'

import * as vscode from 'vscode'

import type { SimpleChatPanelProvider } from '../../../src/chat/chat-view/SimpleChatPanelProvider'

import {
    afterIntegrationTest,
    beforeIntegrationTest,
    getExtensionAPI,
    getTextEditorWithSelection,
    getTranscript,
    waitUntil,
} from '../helpers'

async function getChatViewProvider(): Promise<SimpleChatPanelProvider> {
    const chatViewProvider = await getExtensionAPI().exports.testing?.chatPanelProvider.get()
    assert.ok(chatViewProvider)
    return chatViewProvider
}

suite('Chat', function () {
    this.beforeEach(() => beforeIntegrationTest())
    this.afterEach(() => afterIntegrationTest())

    test('sends and receives a message', async () => {
        await vscode.commands.executeCommand('cody.chat.panel.new')
        const chatView = await getChatViewProvider()
        await chatView.handleUserMessageSubmission('test', 'hello from the human', 'user', [], false)

        assert.match((await getTranscript(0)).displayText || '', /^hello from the human$/)
        await waitUntil(async () =>
            /^hello from the assistant$/.test((await getTranscript(1)).displayText || '')
        )
    })

    // do not display filename even when there is a selection in active editor
    test('append current file link to display text on editor selection', async () => {
        await getTextEditorWithSelection()
        await vscode.commands.executeCommand('cody.chat.panel.new')
        const chatView = await getChatViewProvider()
        await chatView.handleUserMessageSubmission('test', 'hello from the human', 'user', [], false)

        // Display text should include file link at the end of message
        assert.match((await getTranscript(0)).displayText || '', /^hello from the human$/)
        await waitUntil(async () =>
            /^hello from the assistant$/.test((await getTranscript(1)).displayText || '')
        )
    })
})
