import {
    type AuthStatus,
    CURRENT_REPOSITORY_DIRECTORY_PROVIDER_URI,
    type ClientConfiguration,
    CodyIDE,
    type ConfigWatcher,
    FeatureFlag,
    GIT_OPENCTX_PROVIDER_URI,
    WEB_PROVIDER_URI,
    combineLatest,
    featureFlagProvider,
    graphqlClient,
    isError,
    logError,
    setOpenCtx,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

import type {
    ImportedProviderConfiguration,
    ClientConfiguration as OpenCtxClientConfiguration,
} from '@openctx/client'
import type { createController } from '@openctx/vscode-lib'
import { Observable } from 'observable-fns'
import { logDebug, outputChannel } from '../log'
import { authProvider } from '../services/AuthProvider'
import CurrentRepositoryDirectoryProvider from './openctx/currentRepositoryDirectorySearch'
import { gitMentionsProvider } from './openctx/git'
import LinearIssuesProvider from './openctx/linear-issues'
import RemoteDirectoryProvider, { createRemoteDirectoryProvider } from './openctx/remoteDirectorySearch'
import RemoteFileProvider, { createRemoteFileProvider } from './openctx/remoteFileSearch'
import RemoteRepositorySearch, { createRemoteRepositoryProvider } from './openctx/remoteRepositorySearch'
import { createWebProvider } from './openctx/web'

export async function exposeOpenCtxClient(
    context: Pick<vscode.ExtensionContext, 'extension' | 'secrets'>,
    config: ConfigWatcher<ClientConfiguration>,
    createOpenCtxController: typeof createController | undefined
): Promise<void> {
    await warnIfOpenCtxExtensionConflict()
    try {
        const isCodyWeb = config.get().agentIDE === CodyIDE.Web
        const createController =
            createOpenCtxController ?? (await import('@openctx/vscode-lib')).createController

        // Enable fetching of openctx configuration from Sourcegraph instance
        const mergeConfiguration = config.get().experimentalNoodle
            ? getMergeConfigurationFunction()
            : undefined

        const isValidSiteVersion = await graphqlClient.isValidSiteVersion({ minimumVersion: '5.7.0' })

        const controller = createController({
            extensionId: context.extension.id,
            secrets: context.secrets,
            outputChannel,
            features: isCodyWeb ? {} : { annotations: true, statusBar: true },
            providers: isCodyWeb
                ? Observable.of(getCodyWebOpenCtxProviders())
                : getOpenCtxProviders(
                      config.changes,
                      authProvider.instance!.changes,
                      isValidSiteVersion
                  ),
            mergeConfiguration,
        })
        setOpenCtx({
            controller: controller.controller,
            disposable: controller.disposable,
        })
    } catch (error) {
        logDebug('openctx', `Failed to load OpenCtx client: ${error}`)
    }
}

export function getOpenCtxProviders(
    configChanges: Observable<ClientConfiguration>,
    authStatusChanges: Observable<AuthStatus>,
    isValidSiteVersion: boolean
): Observable<ImportedProviderConfiguration[]> {
    return combineLatest([
        configChanges,
        authStatusChanges,
        featureFlagProvider.instance!.evaluatedFeatureFlag(FeatureFlag.GitMentionProvider),
    ]).map(
        ([config, authStatus, gitMentionProvider]: [
            ClientConfiguration,
            AuthStatus,
            boolean | undefined,
        ]) => {
            const providers: ImportedProviderConfiguration[] = [
                {
                    settings: true,
                    provider: createWebProvider(false),
                    providerUri: WEB_PROVIDER_URI,
                },
            ]

            // Remote repository and remote files should be available only for
            // non-dotcom users
            if (!authStatus.isDotCom) {
                providers.push({
                    settings: true,
                    provider: RemoteRepositorySearch,
                    providerUri: RemoteRepositorySearch.providerUri,
                })

                if (isValidSiteVersion) {
                    providers.push({
                        settings: true,
                        provider: RemoteDirectoryProvider,
                        providerUri: RemoteDirectoryProvider.providerUri,
                    })

                    providers.push({
                        settings: true,
                        provider: CurrentRepositoryDirectoryProvider,
                        providerUri: CURRENT_REPOSITORY_DIRECTORY_PROVIDER_URI,
                    })
                }

                providers.push({
                    settings: true,
                    provider: RemoteFileProvider,
                    providerUri: RemoteFileProvider.providerUri,
                })
            }

            if (config.experimentalNoodle) {
                providers.push({
                    settings: true,
                    provider: LinearIssuesProvider,
                    providerUri: LinearIssuesProvider.providerUri,
                })
            }

            if (gitMentionProvider) {
                providers.push({
                    settings: true,
                    provider: gitMentionsProvider,
                    providerUri: GIT_OPENCTX_PROVIDER_URI,
                })
            }

            return providers
        }
    )
}

function getCodyWebOpenCtxProviders(): ImportedProviderConfiguration[] {
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
            providerUri: RemoteDirectoryProvider.providerUri,
            provider: createRemoteDirectoryProvider('Directories'),
        },
        {
            settings: true,
            providerUri: WEB_PROVIDER_URI,
            provider: createWebProvider(true),
        },
    ]
}

function getMergeConfigurationFunction(): Parameters<typeof createController>[0]['mergeConfiguration'] {
    // Cache viewerSettings response since this function can be called
    // multiple times.
    //
    // TODO before this is regarded as ready, we need to introduce some sort
    // of retry and expiry like we do for feature flags. For now we log once.
    const viewerSettingsProvidersCached = getViewerSettingsProviders()
    return async (configuration: OpenCtxClientConfiguration) => {
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

async function getViewerSettingsProviders(): Promise<OpenCtxClientConfiguration['providers']> {
    try {
        const settings = await graphqlClient.viewerSettings()
        if (isError(settings)) {
            throw settings
        }

        const providers = settings['openctx.providers']
        if (!providers) {
            return undefined
        }

        return providers
    } catch (error) {
        logError('OpenCtx', 'failed to fetch viewer settings from Sourcegraph', error)
        return undefined
    }
}

async function warnIfOpenCtxExtensionConflict(): Promise<void> {
    const ext = vscode.extensions.getExtension('sourcegraph.openctx')
    if (!ext) {
        return
    }
    vscode.window.showWarningMessage(
        'Cody directly provides OpenCtx support, please disable the Sourcegraph OpenCtx extension.'
    )
    await vscode.commands.executeCommand('workbench.extensions.action.showExtensionsWithIds', [[ext.id]])
}
