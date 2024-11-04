import {
    type AuthStatus,
    type ClientConfiguration,
    FeatureFlag,
    GIT_OPENCTX_PROVIDER_URI,
    WEB_PROVIDER_URI,
    authStatus,
    clientCapabilities,
    combineLatest,
    createDisposables,
    debounceTime,
    distinctUntilChanged,
    featureFlagProvider,
    graphqlClient,
    isDotCom,
    isError,
    logError,
    pluck,
    promiseFactoryToObservable,
    resolvedConfig,
    setOpenCtx,
    switchMap,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

import type {
    ImportedProviderConfiguration,
    ClientConfiguration as OpenCtxClientConfiguration,
} from '@openctx/client'
import type { createController } from '@openctx/vscode-lib'
import { Observable, map } from 'observable-fns'
import { logDebug } from '../output-channel-logger'
import { gitMentionsProvider } from './openctx/git'
import LinearIssuesProvider from './openctx/linear-issues'
import RemoteDirectoryProvider, { createRemoteDirectoryProvider } from './openctx/remoteDirectorySearch'
import RemoteFileProvider, { createRemoteFileProvider } from './openctx/remoteFileSearch'
import RemoteRepositorySearch, { createRemoteRepositoryProvider } from './openctx/remoteRepositorySearch'
import { createWebProvider } from './openctx/web'

export function exposeOpenCtxClient(
    context: Pick<vscode.ExtensionContext, 'extension' | 'secrets'>,
    createOpenCtxController: typeof createController | undefined
): Observable<void> {
    void warnIfOpenCtxExtensionConflict()

    return combineLatest(
        resolvedConfig.pipe(
            map(({ configuration: { experimentalNoodle } }) => ({
                experimentalNoodle,
            })),
            distinctUntilChanged()
        ),
        authStatus.pipe(
            distinctUntilChanged(),
            debounceTime(0),
            switchMap(auth =>
                auth.authenticated
                    ? promiseFactoryToObservable(signal =>
                          graphqlClient.isValidSiteVersion(
                              {
                                  minimumVersion: '5.7.0',
                              },
                              signal
                          )
                      )
                    : Observable.of(false)
            )
        ),
        promiseFactoryToObservable(
            async () => createOpenCtxController ?? (await import('@openctx/vscode-lib')).createController
        )
    ).pipe(
        createDisposables(([{ experimentalNoodle }, isValidSiteVersion, createController]) => {
            try {
                // Enable fetching of openctx configuration from Sourcegraph instance
                const mergeConfiguration = experimentalNoodle
                    ? getMergeConfigurationFunction()
                    : undefined

                if (!openctxOutputChannel) {
                    // Don't dispose this, so that it stays around for easier debugging even if the
                    // controller (or the whole extension) is disposed.
                    openctxOutputChannel = vscode.window.createOutputChannel('OpenCtx')
                }

                const controller = createController({
                    extensionId: context.extension.id,
                    secrets: context.secrets,
                    outputChannel: openctxOutputChannel!,
                    features: clientCapabilities().isVSCode ? { annotations: true } : {},
                    providers: clientCapabilities().isCodyWeb
                        ? Observable.of(getCodyWebOpenCtxProviders())
                        : getOpenCtxProviders(authStatus, isValidSiteVersion),
                    mergeConfiguration,
                })
                setOpenCtx({
                    controller: controller.controller,
                    disposable: controller.disposable,
                })
                return controller.disposable
            } catch (error) {
                logDebug('openctx', `Failed to load OpenCtx client: ${error}`)
                return undefined
            }
        }),
        map(() => undefined)
    )
}

let openctxOutputChannel: vscode.OutputChannel | undefined

export function getOpenCtxProviders(
    authStatusChanges: Observable<Pick<AuthStatus, 'endpoint'>>,
    isValidSiteVersion: boolean
): Observable<ImportedProviderConfiguration[]> {
    return combineLatest(
        resolvedConfig.pipe(pluck('configuration'), distinctUntilChanged()),
        authStatusChanges,
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.GitMentionProvider)
    ).map(
        ([config, authStatus, gitMentionProvider]: [
            ClientConfiguration,
            Pick<AuthStatus, 'endpoint'>,
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
            if (!isDotCom(authStatus)) {
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
