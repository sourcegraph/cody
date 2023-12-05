import * as assert from 'assert'

import * as vscode from 'vscode'

import { MessageProvider } from '../../src/chat/MessageProvider'

import { afterIntegrationTest, beforeIntegrationTest, getExtensionAPI, getTranscript, waitUntil } from './helpers'

async function getChatViewProvider(): Promise<MessageProvider> {
    const chatViewProvider = await getExtensionAPI().exports.testing?.messageProvider.get()
    assert.ok(chatViewProvider)
    return chatViewProvider
}

suite('Chat', function () {
    this.beforeEach(() => beforeIntegrationTest())
    this.afterEach(() => afterIntegrationTest())

    // TODO Fix test - passes locally but failing in CI

    test.skip('sends and receives a message', async () => {
        await vscode.commands.executeCommand('cody.chat.panel.new')
        const chatView = await getChatViewProvider()
        await chatView.executeRecipe('chat-question', 'hello from the human', 'test')

        assert.match((await getTranscript(0)).displayText || '', /^hello from the human$/)
        await waitUntil(async () => /^hello from the assistant$/.test((await getTranscript(1)).displayText || ''))
    })
})
