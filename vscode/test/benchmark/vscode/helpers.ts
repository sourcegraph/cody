import * as vscode from 'vscode'

import { BENCHMARK_ACCESS_TOKEN, BENCHMARK_ENDPOINT } from '../env'

import { BENCHMARK_EXTENSION_MANUAL_SETUP } from './env'

const waitForManualExtensionSetupConfirmation = async (): Promise<void> => {
    const buttonTitle = 'Resume benchmark suite'

    // eslint-disable-next-line @typescript-eslint/no-misused-promises, no-async-promise-executor
    return new Promise(async resolve => {
        const choice = await vscode.window.showInformationMessage(
            'Paused benchmark suite: Setup your extension',
            buttonTitle
        )
        if (choice === buttonTitle) {
            resolve()
        }
    })
}

export async function initExtension(id: string): Promise<void> {
    const ext = vscode.extensions.getExtension(id)
    await ext?.activate()

    if (BENCHMARK_EXTENSION_MANUAL_SETUP) {
        return waitForManualExtensionSetupConfirmation()
    }

    await ensureExecuteCommand('cody.test.token', BENCHMARK_ENDPOINT, BENCHMARK_ACCESS_TOKEN)
    await ensureExecuteCommand('cody.chat.focus')
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
