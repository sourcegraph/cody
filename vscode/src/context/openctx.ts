import { setOpenCtxClient } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import { logDebug, outputChannel } from '../log'

const DEFAULT_OPENCTX_CONFIGURATION = {
    enable: true,
    providers: {
        'https://openctx.org/npm/@openctx/url-fetcher': true,
    },
}

export function exposeOpenCtxClient(secrets: vscode.SecretStorage): void {
    logDebug('openctx', 'OpenCtx is enabled in Cody')
    import('@openctx/vscode-lib')
        .then(({ createController }) => {
            setOpenCtxClient(
                createController({
                    outputChannel,
                    secrets,
                    features: {},
                    defaultConfiguration: DEFAULT_OPENCTX_CONFIGURATION,
                }).controller.client
            )
        })
        .catch(error => {
            logDebug('openctx', `Failed to load OpenCtx client: ${error}`)
        })
}
