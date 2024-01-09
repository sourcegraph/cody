import * as assert from 'assert'

import * as vscode from 'vscode'

import { type ChatMessage } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { type ExtensionApi } from '../../src/extension-api'
import * as mockServer from '../fixtures/mock-server'

/**
 * Setup (`beforeEach`) function for integration tests that need Cody configured and activated.
 */
export async function beforeIntegrationTest(): Promise<void> {
    // Wait for Cody extension to become ready.
    const api = vscode.extensions.getExtension<ExtensionApi>('sourcegraph.cody-ai')
    assert.ok(api, 'extension not found')

    // TODO(sqs): ensure this doesn't run the activate func multiple times
    await api?.activate()

    // Wait for Cody to become activated.
    // TODO(sqs)
    await new Promise(resolve => setTimeout(resolve, 200))

    // Configure extension.
    await ensureExecuteCommand('cody.test.token', mockServer.SERVER_URL, mockServer.VALID_TOKEN)
}

/**
 * Teardown (`afterEach`) function for integration tests that use {@link beforeIntegrationTest}.
 */
export async function afterIntegrationTest(): Promise<void> {
    await ensureExecuteCommand('cody.test.token', null)
}

// executeCommand specifies ...any[] https://code.visualstudio.com/api/references/vscode-api#commands
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensureExecuteCommand<T>(command: string, ...args: any[]): Promise<T> {
    await waitUntil(async () => (await vscode.commands.getCommands(true)).includes(command))
    const result = await vscode.commands.executeCommand<T>(command, ...args)
    return result
}

export async function waitUntil(predicate: () => Promise<boolean>): Promise<void> {
    let delay = 10
    while (!(await predicate())) {
        await new Promise(resolve => setTimeout(resolve, delay))
        delay <<= 1
    }
}

export function getExtensionAPI(): vscode.Extension<ExtensionApi> {
    const api = vscode.extensions.getExtension<ExtensionApi>('sourcegraph.cody-ai')
    assert.ok(api)
    return api
}

// Waits for the index-th message to appear in the chat transcript, and returns it.
export async function getTranscript(index: number): Promise<ChatMessage> {
    const api = getExtensionAPI()
    const testSupport = api.exports.testing
    assert.ok(testSupport)

    let transcript: ChatMessage[] | undefined

    await waitUntil(async () => {
        if (!api.isActive || !api.exports.testing) {
            return false
        }
        transcript = await getExtensionAPI().exports.testing?.chatMessages()
        return transcript !== undefined && transcript.length > index && Boolean(transcript[index].text)
    })
    assert.ok(transcript)
    return transcript[index]
}

export async function getTextEditorWithSelection(): Promise<void> {
    // Open Main.java
    assert.ok(vscode.workspace.workspaceFolders)
    const mainJavaUri = vscode.Uri.parse(`${vscode.workspace.workspaceFolders[0].uri.toString()}/Main.java`)
    const textEditor = await vscode.window.showTextDocument(mainJavaUri)

    // Select the "main" method
    textEditor.selection = new vscode.Selection(5, 0, 7, 0)
}
