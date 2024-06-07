import { type ConfigurationWithAccessToken, setOpenCtxClient } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { logDebug, outputChannel } from '../log'
import RemoteFileProvider from './openctx/remoteFileSearch'
import RemoteRepositorySearch from './openctx/remoteRepositorySearch'
import WebProvider from './openctx/web'

export async function exposeOpenCtxClient(
    secrets: vscode.SecretStorage,
    config: ConfigurationWithAccessToken
) {
    logDebug('openctx', 'OpenCtx is enabled in Cody')
    await warnIfOpenCtxExtensionConflict()
    try {
        const { createController } = await import('@openctx/vscode-lib')
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
        }

        setOpenCtxClient(
            createController({
                outputChannel,
                secrets,
                features: {},
                providers,
            }).controller.client
        )
    } catch (error) {
        logDebug('openctx', `Failed to load OpenCtx client: ${error}`)
    }
}

async function warnIfOpenCtxExtensionConflict() {
    const ext = vscode.extensions.getExtension('sourcegraph.openctx')
    if (!ext) {
        return
    }
    vscode.window.showWarningMessage(
        'Cody directly provides OpenCtx support, please disable the Sourcegraph OpenCtx extension.'
    )
    await vscode.commands.executeCommand('workbench.extensions.action.showExtensionsWithIds', [[ext.id]])
}
