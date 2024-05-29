import { isDotCom, setOpenCtxClient } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import { logDebug, outputChannel } from '../log'
import RemoteFileProvider from './openctx/remoteFileSearch'
import RemoteRepositorySearch from './openctx/remoteRepositorySearch'

export function exposeOpenCtxClient(
    secrets: vscode.SecretStorage,
    config: { serverEndpoint: string }
): void {
    logDebug('openctx', 'OpenCtx is enabled in Cody')
    import('@openctx/vscode-lib')
        .then(({ createController }) => {
            setOpenCtxClient(
                createController({
                    outputChannel,
                    secrets,
                    features: {},
                    providers: isDotCom(config.serverEndpoint)
                        ? []
                        : [
                              {
                                  providerUri: RemoteRepositorySearch.providerUri,
                                  settings: true,
                                  provider: RemoteRepositorySearch,
                              },
                              {
                                  providerUri: RemoteFileProvider.providerUri,
                                  settings: true,
                                  provider: RemoteFileProvider,
                              },
                          ],
                }).controller.client
            )
        })
        .catch(error => {
            logDebug('openctx', `Failed to load OpenCtx client: ${error}`)
        })
}
