import {
    CodyIDE,
    type ConfigurationWithAccessToken,
    FeatureFlag,
    GIT_OPENCTX_PROVIDER_URI,
    WEB_PROVIDER_URI,
    featureFlagProvider,
    graphqlClient,
    isError,
    logError,
    setOpenCtx,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

import type { ClientConfiguration, Provider } from '@openctx/client'
import type { createController } from '@openctx/vscode-lib'
import { logDebug, outputChannel } from '../log'
import { gitMentionsProvider } from './openctx/git'
import LinearIssuesProvider from './openctx/linear-issues'
import RemoteFileProvider, { createRemoteFileProvider } from './openctx/remoteFileSearch'
import RemoteRepositorySearch, { createRemoteRepositoryProvider } from './openctx/remoteRepositorySearch'
import { createWebProvider } from './openctx/web'

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
            ? getCodyWebOpenCtxProviders()
            : await getStandardOpenCtxProviders(config, isDotCom)
        const createController =
            createOpenCtxController ?? (await import('@openctx/vscode-lib')).createController

        // Enable fetching of openctx configuration from Sourcegraph instance
        const mergeConfiguration = config.experimentalNoodle
            ? getMergeConfigurationFunction()
            : undefined

        const controller = createController({
            extensionId: context.extension.id,
            secrets: context.secrets,
            outputChannel,
            features: {},
            providers,
            mergeConfiguration,
            preloadDelay: 5 * 1000, // 5 seconds
        })

        setOpenCtx({
            client: controller.controller,
            disposable: controller.disposable,
        })
    } catch (error) {
        logDebug('openctx', `Failed to load OpenCtx client: ${error}`)
    }
}

async function getStandardOpenCtxProviders(
    config: ConfigurationWithAccessToken,
    isDotCom: boolean
): Promise<{ settings: any; provider: Provider; providerUri: string }[]> {
    const providers: {
        settings: any
        provider: Provider
        providerUri: string
    }[] = [
        {
            settings: true,
            provider: createWebProvider(false),
            providerUri: WEB_PROVIDER_URI,
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

    if (await featureFlagProvider.evaluateFeatureFlag(FeatureFlag.GitMentionProvider)) {
        providers.push({
            settings: true,
            provider: gitMentionsProvider,
            providerUri: GIT_OPENCTX_PROVIDER_URI,
        })
    }

    return providers
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
        {
            settings: true,
            providerUri: WEB_PROVIDER_URI,
            provider: createWebProvider(true),
        },
    ]
}

function getMergeConfigurationFunction() {
    // Cache viewerSettings response since this function can be called
    // multiple times.
    //
    // TODO before this is regarded as ready, we need to introduce some sort
    // of retry and expiry like we do for feature flags. For now we log once.
    const viewerSettingsProvidersCached = getViewerSettingsProviders()
    return async (configuration: ClientConfiguration) => {
        const providers = await viewerSettingsProvidersCached
        if (!providers) {
            return configuration
        }
        // Prefer user configured providers
        for (const [k, v] of Object.entries(configuration.providers || {})) {
            providers[k] = v
        }
        return {
            ...configuration,
            providers,
        }
    }
}

async function getViewerSettingsProviders() {
    try {
        const settings = await graphqlClient.viewerSettings()
        if (isError(settings)) {
            throw settings
        }

        const providers = settings['openctx.providers']
        if (!providers) {
            return undefined
        }

        return providers as ClientConfiguration['providers']
    } catch (error) {
        logError('OpenCtx', 'failed to fetch viewer settings from Sourcegraph', error)
        return undefined
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
