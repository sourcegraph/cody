import {
    CodyIDE,
    type ConfigurationWithAccessToken,
    FeatureFlag,
    GIT_OPENCTX_PROVIDER_URI,
    asyncGeneratorValues,
    featureFlagProvider,
    firstValueFrom,
    setOpenCtxClient,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

import type { Provider } from '@openctx/client'
import type { createController } from '@openctx/vscode-lib'
import { logDebug, outputChannel } from '../log'
import { gitMentionsProvider } from './openctx/git'
import LinearIssuesProvider from './openctx/linear-issues'
import RemoteFileProvider, { createRemoteFileProvider } from './openctx/remoteFileSearch'
import RemoteRepositorySearch, { createRemoteRepositoryProvider } from './openctx/remoteRepositorySearch'
import WebProvider from './openctx/web'

export async function exposeOpenCtxClient(
    context: Pick<vscode.ExtensionContext, 'extension' | 'secrets'>,
    config: ConfigurationWithAccessToken,
    isDotCom: boolean,
    createOpenCtxController: typeof createController | undefined
) {
    logDebug('openctx', 'OpenCtx is enabled in Cody')
    await warnIfOpenCtxExtensionConflict()
    try {
        const isCodyWeb = config.agentIDE === CodyIDE.Web
        const providers = isCodyWeb
            ? asyncGeneratorValues(getCodyWebOpenCtxProviders())
            : getStandardOpenCtxProviders(config, isDotCom)
        const createController =
            createOpenCtxController ?? (await import('@openctx/vscode-lib')).createController

        setOpenCtxClient(
            createController({
                extensionId: context.extension.id,
                secrets: context.secrets,
                outputChannel,
                features: { annotations: true, statusBar: true },
                providers: await firstValueFrom(providers),
            }).controller
        )
    } catch (error) {
        logDebug('openctx', `Failed to load OpenCtx client: ${error}`)
    }
}

async function* getStandardOpenCtxProviders(
    config: ConfigurationWithAccessToken,
    isDotCom: boolean
): AsyncGenerator<{ settings: any; provider: Provider; providerUri: string }[]> {
    const providers: { settings: any; provider: Provider; providerUri: string }[] = [
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

    // TODO!(sqs): convert to AsyncGnenerator
    if (await featureFlagProvider.evaluateFeatureFlag(FeatureFlag.GitMentionProvider)) {
        providers.push({
            settings: true,
            provider: gitMentionsProvider,
            providerUri: GIT_OPENCTX_PROVIDER_URI,
        })
    }

    yield providers
}

function getCodyWebOpenCtxProviders() {
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
