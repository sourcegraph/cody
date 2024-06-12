import * as vscode from 'vscode'

let runningAuthProgressIndicator: null | (() => void) = null

export function startAuthProgressIndicator(): void {
    vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Signing in to Sourcegraph...',
            cancellable: true,
        },
        (progress, token) => {
            token.onCancellationRequested(() => {
                runningAuthProgressIndicator = null
            })

            return new Promise<void>(resolve => {
                runningAuthProgressIndicator = resolve
            })
        }
    )
}

export function closeAuthProgressIndicator(): void {
    runningAuthProgressIndicator?.()
    runningAuthProgressIndicator = null
}
