import { Observable, Subject, interval, map, merge } from 'observable-fns'
import semver from 'semver'
import { authStatus } from '../auth/authStatus'
import { editorWindowIsFocused } from '../editor/editorState'
import { logDebug, logError } from '../logger'
import {
    debounceTime,
    distinctUntilChanged,
    filter,
    firstValueFrom,
    promiseFactoryToObservable,
    startWith,
    switchMap,
} from '../misc/observable'
import {
    pendingOperation,
    skipPendingOperation,
    switchMapReplayOperation,
} from '../misc/observableOperation'
import { isError } from '../utils'
import { isAbortError } from './errors'
import {
    type CodyConfigFeatures,
    type GraphQLAPIClientConfig,
    type TemporarySettings,
    graphqlClient,
} from './graphql/client'

export interface CodyNotice {
    key: string
    title: string
    message: string
}

// The client configuration describing all of the features that are currently available.
//
// This is fetched from the Sourcegraph instance and is specific to the current user.
//
// For the canonical type definition, see https://sourcegraph.com/github.com/sourcegraph/sourcegraph/-/blob/internal/clientconfig/types.go
export interface CodyClientConfig {
    // Whether the site admin allows this user to make use of the Cody chat feature.
    chatEnabled: boolean

    // Whether the site admin allows this user to make use of the Cody autocomplete feature.
    autoCompleteEnabled: boolean

    // Whether the site admin allows the user to make use of the **custom** Cody commands feature.
    customCommandsEnabled: boolean

    // Whether the site admin allows this user to make use of the Cody attribution feature.
    attributionEnabled: boolean

    // Whether the 'smart context window' feature should be enabled, and whether the Sourcegraph
    // instance supports various new GraphQL APIs needed to make it work.
    smartContextWindowEnabled: boolean

    // Whether the new Sourcegraph backend LLM models API endpoint should be used to query which
    // models are available.
    modelsAPIEnabled: boolean

    // Whether the user should sign in to an enterprise instance.
    userShouldUseEnterprise: boolean

    // Whether the user should be able to use the intent detection feature.
    // `opt-in` means the user must explicitly enable it.
    intentDetection: 'disabled' | 'enabled' | 'opt-in'

    // List of global instance-level cody notice/banners (set only by admins in global
    // instance configuration file
    notices: CodyNotice[]

    temporarySettings: Partial<TemporarySettings>

    // The version of the Sourcegraph instance.
    siteVersion?: string

    // Whether the user should be able to use the omnibox feature.
    omniBoxEnabled: boolean
}

export const dummyClientConfigForTest: CodyClientConfig = {
    chatEnabled: true,
    autoCompleteEnabled: true,
    customCommandsEnabled: true,
    attributionEnabled: true,
    smartContextWindowEnabled: true,
    modelsAPIEnabled: true,
    userShouldUseEnterprise: false,
    intentDetection: 'enabled',
    temporarySettings: {},
    notices: [],
    siteVersion: undefined,
    omniBoxEnabled: false,
}

/**
 * ClientConfigSingleton is a class that manages the retrieval
 * and caching of configuration features from GraphQL endpoints.
 */
export class ClientConfigSingleton {
    private static instance: ClientConfigSingleton

    // REFETCH_INTERVAL is only updated via process.env during test execution, otherwise it is 60 seconds.
    public static REFETCH_INTERVAL = process.env.CODY_CLIENT_CONFIG_SINGLETON_REFETCH_INTERVAL
        ? Number.parseInt(process.env.CODY_CLIENT_CONFIG_SINGLETON_REFETCH_INTERVAL, 10)
        : 60 * 1000

    // Default values for the legacy GraphQL features API, used when a Sourcegraph instance
    // does not support even the legacy GraphQL API.
    private readonly featuresLegacy: Readonly<CodyConfigFeatures> = {
        chat: true,
        autoComplete: true,
        commands: true,
        attribution: false,
    }

    private readonly forceUpdateSubject = new Subject<any>()

    /**
     * Forces an immediate update of the client configuration by triggering a new fetch.
     * This method is called when temporary settings are edited from the client to ensure
     * the configuration is immediately synchronized with the latest changes.
     *
     * @returns A promise that resolves to the updated CodyClientConfig or undefined
     */
    public async forceUpdate(): Promise<CodyClientConfig | undefined> {
        this.forceUpdateSubject.next(true)
        return firstValueFrom(this.changes.pipe(skipPendingOperation()))
    }
    /**
     * An observable that immediately emits the last-cached value (or fetches it if needed) and then
     * emits changes.
     */
    public readonly changes: Observable<CodyClientConfig | undefined | typeof pendingOperation> = merge(
        authStatus,
        this.forceUpdateSubject
    ).pipe(
        debounceTime(0), // wait a tick for graphqlClient's auth to be updated
        switchMapReplayOperation(authStatus =>
            authStatus.authenticated
                ? interval(ClientConfigSingleton.REFETCH_INTERVAL).pipe(
                      map(() => undefined),
                      // Don't update if the editor is in the background, to avoid network
                      // activity that can cause OS warnings or authorization flows when the
                      // user is not using Cody. See
                      // linear.app/sourcegraph/issue/CODY-3745/codys-background-periodic-network-access-causes-2fa.
                      filter((_value): _value is undefined => editorWindowIsFocused()),
                      startWith(undefined),
                      switchMap(() => promiseFactoryToObservable(signal => this.fetchConfig(signal)))
                  )
                : Observable.of(undefined)
        ),
        map(value => (isError(value) ? undefined : value)),
        distinctUntilChanged()
    )

    public readonly updates: Observable<CodyClientConfig> = this.changes.pipe(
        filter(value => value !== undefined && value !== pendingOperation),
        distinctUntilChanged()
    )

    private constructor() {}

    // Static method to get the singleton instance
    public static getInstance(): ClientConfigSingleton {
        if (!ClientConfigSingleton.instance) {
            ClientConfigSingleton.instance = new ClientConfigSingleton()
        }
        return ClientConfigSingleton.instance
    }

    /**
     * @internal For testing only.
     */
    public static testing__new(): ClientConfigSingleton {
        return new ClientConfigSingleton()
    }

    public async getConfig(signal?: AbortSignal): Promise<CodyClientConfig | undefined> {
        return await firstValueFrom(this.changes.pipe(skipPendingOperation()), signal)
    }

    private async fetchConfig(signal?: AbortSignal): Promise<CodyClientConfig> {
        logDebug('ClientConfigSingleton', 'refreshing configuration')

        try {
            // Determine based on the site version if /.api/client-config is available.
            const siteVersion = await graphqlClient.getSiteVersion(signal)

            signal?.throwIfAborted()

            let supportsClientConfig = false

            let omniBoxEnabled = false

            if (isError(siteVersion)) {
                if (isAbortError(siteVersion)) {
                    throw siteVersion
                }
                logError(
                    'ClientConfigSingleton',
                    'Failed to determine site version, GraphQL error',
                    siteVersion
                )

                supportsClientConfig = false
            } else {
                // Insiders and dev builds support the new /.api/client-config endpoint
                const insiderBuild = siteVersion.length > 12 || siteVersion.includes('dev')

                // Sourcegraph instances before 5.5.0 do not support the new /.api/client-config endpoint.
                supportsClientConfig = insiderBuild || !semver.lt(siteVersion, '5.5.0')

                // Enable OmniBox for Sourcegraph instances 6.0.0 and above or dev instances
                omniBoxEnabled = insiderBuild || semver.gte(siteVersion, '6.0.0')
            }

            signal?.throwIfAborted()

            // If /.api/client-config is not available, fallback to the myriad of GraphQL
            // requests that we previously used to determine the client configuration
            const clientConfig = await (supportsClientConfig
                ? this.fetchConfigEndpoint(signal)
                : this.fetchClientConfigLegacy(signal))

            signal?.throwIfAborted()
            logDebug('ClientConfigSingleton', 'refreshed', JSON.stringify(clientConfig))

            return Promise.all([
                graphqlClient.viewerSettings(signal),
                graphqlClient.temporarySettings(signal),
            ]).then(([viewerSettings, temporarySettings]) => {
                const config: CodyClientConfig = {
                    ...clientConfig,
                    intentDetection: 'enabled',
                    notices: [],
                    temporarySettings: {},
                    siteVersion: isError(siteVersion) ? undefined : siteVersion,
                    omniBoxEnabled,
                }

                // Don't fail the whole chat because of viewer setting (used only to show banners)
                if (!isError(viewerSettings)) {
                    config.intentDetection = ['disabled', 'enabled', 'opt-in'].includes(
                        viewerSettings['omnibox.intentDetection']
                    )
                        ? viewerSettings['omnibox.intentDetection']
                        : 'enabled'
                    // Make sure that notice object will have all important field (notices come from
                    // instance global JSONC configuration so they can have any arbitrary field values.
                    config.notices = Array.from<Partial<CodyNotice>, CodyNotice>(
                        viewerSettings['cody.notices'] ?? [],
                        (notice, index) => ({
                            key: notice?.key ?? index.toString(),
                            title: notice?.title ?? '',
                            message: notice?.message ?? '',
                        })
                    )
                }

                if (!isError(temporarySettings)) {
                    config.temporarySettings = temporarySettings
                }

                return config
            })
        } catch (e) {
            if (!isAbortError(e)) {
                logError('ClientConfigSingleton', 'failed to refresh client config', e)
            }
            throw e
        }
    }

    private async fetchClientConfigLegacy(signal?: AbortSignal): Promise<CodyClientConfig> {
        // Note: all of these promises are written carefully to not throw errors internally, but
        // rather to return sane defaults, and so we do not catch() here.
        const smartContextWindow = await graphqlClient.getCodyLLMConfigurationSmartContext(signal)
        signal?.throwIfAborted()
        const features = await this.fetchConfigFeaturesLegacy(this.featuresLegacy, signal)
        signal?.throwIfAborted()

        return {
            chatEnabled: features.chat,
            autoCompleteEnabled: features.autoComplete,
            customCommandsEnabled: features.commands,
            attributionEnabled: features.attribution,
            smartContextWindowEnabled: smartContextWindow,

            // Things that did not exist before logically default to disabled.
            intentDetection: 'disabled',
            modelsAPIEnabled: false,
            userShouldUseEnterprise: false,
            notices: [],
            temporarySettings: {},
            omniBoxEnabled: false,
        }
    }

    // Fetches the config features from the server and handles errors, using the old/legacy GraphQL API.
    private async fetchConfigFeaturesLegacy(
        defaultErrorValue: CodyConfigFeatures,
        signal?: AbortSignal
    ): Promise<CodyConfigFeatures> {
        const features = await graphqlClient.getCodyConfigFeatures(signal)
        if (features instanceof Error) {
            // An error here most likely indicates the Sourcegraph instance is so old that it doesn't
            // even support this legacy GraphQL API.
            logError('ClientConfigSingleton', 'refreshConfig', features)
            return defaultErrorValue
        }
        return features
    }

    private async fetchConfigEndpoint(
        signal?: AbortSignal,
        config?: GraphQLAPIClientConfig
    ): Promise<CodyClientConfig> {
        return graphqlClient
            .fetchHTTP<CodyClientConfig>(
                'client-config',
                'GET',
                '/.api/client-config',
                undefined,
                signal,
                config
            )
            .then(clientConfig => {
                if (isError(clientConfig)) {
                    throw clientConfig
                }
                return clientConfig
            })
    }

    // Fetches the config with token, this method is used for fetching config before the user is logged in.
    public async fetchConfigWithToken(
        config: GraphQLAPIClientConfig,
        signal?: AbortSignal
    ): Promise<CodyClientConfig | undefined> {
        return this.fetchConfigEndpoint(signal, config)
    }
}
