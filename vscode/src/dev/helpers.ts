import * as vscode from 'vscode'

import { authStatus, resolvedConfig, subscriptionDisposable } from '@sourcegraph/cody-shared'
import { outputChannelManager } from '../output-channel-logger'

/**
 * A development helper that runs on activation to make the edit-debug loop easier.
 *
 * The following VS Code settings are respected. (They are not part of this extension's contributed
 * configuration JSON Schema, so they will not validate in your VS Code user settings file.)
 *
 * - `cody.dev.openAutocompleteTraceView`: boolean
 * - `cody.dev.openOutputConsole`: boolean
 */
export function onActivationDevelopmentHelpers(): void {
    const settings = vscode.workspace.getConfiguration('cody.dev')

    if (settings.get('openAutocompleteTraceView')) {
        void vscode.commands.executeCommand('cody.autocomplete.openTraceView')
    }

    if (settings.get('openOutputConsole')) {
        outputChannelManager.defaultOutputChannel.show()
    }
}

/**
 * A development helper that logs emissions from the global {@link resolvedConfig} and
 * {@link authStatus} observables.
 */
export function logGlobalStateEmissions(): vscode.Disposable {
    const disposables: vscode.Disposable[] = []

    let configChanges = 0
    let lastConfigTime = performance.now()
    disposables.push(
        subscriptionDisposable(
            resolvedConfig.subscribe(config => {
                const now = performance.now()
                console.debug(
                    `%cCONFIG ${++configChanges} %c[+${Math.round(now - lastConfigTime)}ms]`,
                    'color: green',
                    'color: gray',
                    config
                )
                lastConfigTime = now
            })
        )
    )

    let authStatusChanges = 0
    let lastAuthTime = performance.now()
    disposables.push(
        subscriptionDisposable(
            authStatus.subscribe(authStatus => {
                const now = performance.now()
                console.debug(
                    `%cAUTH ${++authStatusChanges} %c[+${Math.round(now - lastAuthTime)}ms]`,
                    'color: green',
                    'color: gray',
                    authStatus
                )
                lastAuthTime = now
            })
        )
    )

    return vscode.Disposable.from(...disposables)
}
