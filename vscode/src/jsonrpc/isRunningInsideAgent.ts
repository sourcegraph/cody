import * as vscode from 'vscode'

export function isRunningInsideAgent(): boolean {
    return vscode.workspace.getConfiguration().get<boolean>('cody.advanced.agent.running', false)
}
