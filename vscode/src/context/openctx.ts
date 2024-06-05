import { type ConfigurationWithAccessToken, setOpenCtxClient } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import { logDebug, outputChannel } from '../log'
import GlobalChatMemoryProvider from './openctx/globalChatMemory'
import RemoteFileProvider from './openctx/remoteFileSearch'
import RemoteRepositorySearch from './openctx/remoteRepositorySearch'
import WebProvider from './openctx/web'

export function exposeOpenCtxClient(
    secrets: vscode.SecretStorage,
    config: ConfigurationWithAccessToken
): void {
    logDebug('openctx', 'OpenCtx is enabled in Cody')
    import('@openctx/vscode-lib')
        .then(({ createController }) => {
            const providers = [
                {
                    providerUri: WebProvider.providerUri,
                    settings: true,
                    provider: WebProvider,
                },
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
                providers.push({
                    providerUri: GlobalChatMemoryProvider.providerUri,
                    settings: true,
                    provider: GlobalChatMemoryProvider,
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
