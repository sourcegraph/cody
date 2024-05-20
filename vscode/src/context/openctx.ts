import { setOpenCtxClient } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { logDebug, outputChannel } from '../log'

export function exposeOpenCtxClient(secrets: vscode.SecretStorage): void {
    if (vscode.workspace.getConfiguration('cody').get('experimental.openctx', false)) {
        logDebug('openctx', 'OpenCtx is enabled in Cody')
        import('@openctx/vscode-lib')
            .then(({ createController }) => {
                setOpenCtxClient(
                    createController({ outputChannel, secrets, features: {} }).controller.client
                )
            })
            .catch(error => {
                logDebug('openctx', `Failed to load OpenCtx client: ${error}`)
            })
    }
}
