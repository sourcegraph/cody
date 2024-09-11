import * as assert from 'node:assert'

import * as vscode from 'vscode'

import type { ChatController } from '../../../src/chat/chat-view/ChatController'

import {
    afterIntegrationTest,
    beforeIntegrationTest,
    getExtensionAPI,
    getTextEditorWithSelection,
    getTranscript,
    waitUntil,
} from '../helpers'

async function getChatViewProvider(): Promise<ChatController> {
    const chatViewProvider = await getExtensionAPI().exports.testing?.chatPanelProvider.get()
    assert.ok(chatViewProvider)
    return chatViewProvider
}

// Note: The integration runner can not require from lib-shared so we have to expose
// this instead.
function getPs() {
    return getExtensionAPI().exports.testing?.ps!
}

suite('Chat', function () {
    this.beforeEach(() => beforeIntegrationTest())
    this.afterEach(() => afterIntegrationTest())

    test('sends and receives a message', async () => {
        await vscode.commands.executeCommand('cody.chat.newEditorPanel')
        const chatView = await getChatViewProvider()
        await chatView.handleUserMessageSubmission({
            requestID: 'test',
            inputText: getPs()`hello from the human`,
            submitType: 'user',
            mentions: [],
            editorState: null,
            legacyAddEnhancedContext: false,
            signal: new AbortController().signal,
        })

        assert.match((await getTranscript(0)).text?.toString() || '', /^hello from the human$/)
        await waitUntil(async () =>
            /^hello from the assistant$/.test((await getTranscript(1)).text?.toString() || '')
        )
    })

    // do not display filename even when there is a selection in active editor
    test('append current file link to display text on editor selection', async () => {
        await getTextEditorWithSelection()
        await vscode.commands.executeCommand('cody.chat.newEditorPanel')
        const chatView = await getChatViewProvider()
        await chatView.handleUserMessageSubmission({
            requestID: 'test',
            inputText: getPs()`hello from the human`,
            submitType: 'user',
            mentions: [],
            editorState: null,
            legacyAddEnhancedContext: false,
            signal: new AbortController().signal,
        })

        // Display text should include file link at the end of message
        assert.match((await getTranscript(0)).text?.toString() || '', /^hello from the human$/)
        await waitUntil(async () =>
            /^hello from the assistant$/.test((await getTranscript(1)).text?.toString() || '')
        )
    })
})
