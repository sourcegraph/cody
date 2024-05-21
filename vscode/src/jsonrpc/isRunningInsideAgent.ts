import * as vscode from 'vscode'

let cached: boolean | undefined
export function isRunningInsideAgent(): boolean {
    if (cached === undefined) {
        cached = vscode.workspace.getConfiguration().get<boolean>('cody.advanced.agent.running', false)
    }
    return cached
}
