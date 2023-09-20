import * as assert from 'assert'

import * as vscode from 'vscode'

import { ExtensionApi } from '../../src/extension-api'

export async function setup(): Promise<void> {
    const { BENCHMARK_ENDPOINT, BENCHMARK_ACCESS_TOKEN } = process.env
    if (!BENCHMARK_ENDPOINT || !BENCHMARK_ACCESS_TOKEN) {
        throw new Error('Provide SRC_ENDPOINT and SRC_ACCESS_TOKEN to run the on suite')
    }

    // Wait for Cody extension to become ready.
    const api = vscode.extensions.getExtension<ExtensionApi>('sourcegraph.cody-ai')
    assert.ok(api, 'extension not found')

    // TODO(sqs): ensure this doesn't run the activate func multiple times
    await api?.activate()

    // Wait for Cody to become activated.
    // TODO(sqs)
    await new Promise(resolve => setTimeout(resolve, 500))

    // Configure extension.
    await ensureExecuteCommand('cody.test.token', BENCHMARK_ENDPOINT, BENCHMARK_ACCESS_TOKEN)
    await ensureExecuteCommand('cody.chat.focus')
}

/**
 * Teardown (`afterEach`) function for integration tests that use {@link beforeIntegrationTest}.
 */
export async function teardown(): Promise<void> {
    await ensureExecuteCommand('cody.interactive.clear')
    await ensureExecuteCommand('cody.history.clear')
    await ensureExecuteCommand('cody.test.token', null, null)
}

/**
 * Clean up command for VS Code.
 * Closes all open files.
 */
export async function cleanup(): Promise<void> {
    await ensureExecuteCommand('workbench.action.closeAllEditors')
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
