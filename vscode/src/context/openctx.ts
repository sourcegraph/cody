import { graphqlClient, setOpenCtxClient } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import { logDebug, outputChannel } from '../log'
import RemoteRepositorySearch from './openctx/remoteRepositorySearch'

export function exposeOpenCtxClient(secrets: vscode.SecretStorage): void {
    logDebug('openctx', 'OpenCtx is enabled in Cody')
    import('@openctx/vscode-lib')
        .then(({ createController }) => {
            setOpenCtxClient(
                createController({
                    outputChannel,
                    secrets,
                    features: {},
                    providers: graphqlClient.isDotCom()
                        ? []
                        : [
                              {
                                  providerUri: 'internal-remote-repository-search',
                                  settings: true,
                                  provider: RemoteRepositorySearch,
                              },
                          ],
                }).controller.client
            )
        })
        .catch(error => {
            logDebug('openctx', `Failed to load OpenCtx client: ${error}`)
        })
}
