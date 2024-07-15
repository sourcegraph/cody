import { CodyIDE, type ConfigurationWithAccessToken, setOpenCtxClient } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

import { logDebug, outputChannel } from '../log'
import LinearIssuesProvider from './openctx/linear-issues'
import RemoteFileProvider, { createRemoteFileProvider } from './openctx/remoteFileSearch'
import RemoteRepositorySearch, { createRemoteRepositoryProvider } from './openctx/remoteRepositorySearch'
import WebProvider from './openctx/web'

export async function exposeOpenCtxClient(
    context: Pick<vscode.ExtensionContext, 'extension' | 'secrets'>,
    config: ConfigurationWithAccessToken,
    isDotCom: boolean,
    // TODO [VK] Expose createController openctx type from vscode-lib
    createOpenContextController: ((...args: any[]) => any) | undefined
) {
    logDebug('openctx', 'OpenCtx is enabled in Cody')
    await warnIfOpenCtxExtensionConflict()
    try {
        const isCodyWeb = config.agentIDE === CodyIDE.Web
        const providers = isCodyWeb
            ? getCodyWebOpenContextProviders()
            : getStandardOpenContextProviders(config, isDotCom)
        const createController =
            createOpenContextController ?? (await import('@openctx/vscode-lib')).createController

        setOpenCtxClient(
            createController({
                extensionId: context.extension.id,
                secrets: context.secrets,
                outputChannel,
                features: {},
                providers,
                preloadDelay: 5 * 1000, // 5 seconds
            }).controller
        )
    } catch (error) {
        logDebug('openctx', `Failed to load OpenCtx client: ${error}`)
    }
}

function getStandardOpenContextProviders(config: ConfigurationWithAccessToken, isDotCom: boolean) {
    // TODO [vk] expose types for providers from openctx/client lib
    const providers: any[] = [
        {
            settings: true,
            provider: WebProvider,
            providerUri: WebProvider.providerUri,
        },
    ]

    // Remote repository and remote files should be available only for
    // non-dotcom users
    if (!isDotCom) {
        providers.push({
            settings: true,
            provider: RemoteRepositorySearch,
            providerUri: RemoteRepositorySearch.providerUri,
        })

        if (config.experimentalNoodle) {
            providers.push({
                settings: true,
                provider: RemoteFileProvider,
                providerUri: RemoteFileProvider.providerUri,
            })
        }
    }

    if (config.experimentalNoodle) {
        providers.push({
            settings: true,
            provider: LinearIssuesProvider,
            providerUri: LinearIssuesProvider.providerUri,
        })
    }

    return providers
}

function getCodyWebOpenContextProviders() {
    return [
        {
            settings: true,
            providerUri: RemoteRepositorySearch.providerUri,
            provider: createRemoteRepositoryProvider('Repositories'),
        },
        {
            settings: true,
            providerUri: RemoteFileProvider.providerUri,
            provider: createRemoteFileProvider('Files'),
        },
    ]
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
