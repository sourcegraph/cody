// import * as assert from 'assert'

import * as vscode from 'vscode'

import { BENCHMARK_ACCESS_TOKEN, BENCHMARK_ENDPOINT } from './config'
import { CODY_EXTENSION_ID } from './constants'

const waitForManualExtensionSetupConfirmation = async (): Promise<void> => {
    const buttonTitle = 'Resume evaluation suite'

    // eslint-disable-next-line @typescript-eslint/no-misused-promises, no-async-promise-executor
    return new Promise(async resolve => {
        const choice = await vscode.window.showInformationMessage(
            'Paused evaluation suite: Setup your extension',
            buttonTitle
        )
        if (choice === buttonTitle) {
            resolve()
        }
    })
}

export async function initExtension(id: string): Promise<void> {
    const ext = vscode.extensions.getExtension(id)
    // Wait a short amount to give extension time to activate
    await ext?.activate()

    if (id !== CODY_EXTENSION_ID) {
        // Unknown setup steps
        return waitForManualExtensionSetupConfirmation()
    }

    await new Promise(resolve => setTimeout(resolve, 500))
    await ensureExecuteCommand('cody.test.token', BENCHMARK_ENDPOINT, BENCHMARK_ACCESS_TOKEN)
    await ensureExecuteCommand('cody.chat.focus')
}

export async function teardownExtension(id: string): Promise<void> {
    if (id !== CODY_EXTENSION_ID) {
        // Nothing to do
        return
    }

    await ensureExecuteCommand('cody.interactive.clear')
    await ensureExecuteCommand('cody.history.clear')
    await ensureExecuteCommand('cody.test.token', null, null)
}

export async function cleanUpAfterEvaluation(): Promise<void> {
    await vscode.commands.executeCommand('_workbench.revertAllDirty')
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
