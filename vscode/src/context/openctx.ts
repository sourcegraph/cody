import { type ConfigurationWithAccessToken, setOpenCtxClient } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import { logDebug, outputChannel } from '../log'
import RemoteFileProvider from './openctx/remoteFileSearch'
import RemoteRepositorySearch from './openctx/remoteRepositorySearch'

export function exposeOpenCtxClient(
    secrets: vscode.SecretStorage,
    config: ConfigurationWithAccessToken
): void {
    logDebug('openctx', 'OpenCtx is enabled in Cody')
    import('@openctx/vscode-lib')
        .then(({ createController }) => {
            const providers = [
                {
                    providerUri: RemoteRepositorySearch.providerUri,
                    settings: true,
                    provider: RemoteRepositorySearch,
                },
            ]

            if (config.experimentalNoodle) {
                providers.push({
                    providerUri: RemoteFileProvider.providerUri,
                    settings: true,
                    provider: RemoteFileProvider,
                })
            }

            setOpenCtxClient(
                createController({
                    outputChannel,
                    secrets,
                    features: {},
                    providers,
                }).controller.client
            )
        })
        .catch(error => {
            logDebug('openctx', `Failed to load OpenCtx client: ${error}`)
        })
}
