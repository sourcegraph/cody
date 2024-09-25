import { Observable, interval, map } from 'observable-fns'
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
    type pendingOperation,
    skipPendingOperation,
    switchMapReplayOperation,
} from '../misc/observableOperation'
import { isError } from '../utils'
import { isAbortError } from './errors'
import { type CodyConfigFeatures, graphqlClient } from './graphql/client'

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
}

/**
 * ClientConfigSingleton is a class that manages the retrieval
 * and caching of configuration features from GraphQL endpoints.
 */
export class ClientConfigSingleton {
    private static instance: ClientConfigSingleton

    public static readonly REFETCH_INTERVAL = 60 * 1000

    // Default values for the legacy GraphQL features API, used when a Sourcegraph instance
    // does not support even the legacy GraphQL API.
    private readonly featuresLegacy: Readonly<CodyConfigFeatures> = {
        chat: true,
        autoComplete: true,
        commands: true,
        attribution: false,
    }

    /**
     * An observable that immediately emits the last-cached value (or fetches it if needed) and then
     * emits changes.
     */
    public readonly changes: Observable<CodyClientConfig | undefined | typeof pendingOperation> =
        authStatus.pipe(
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

        // Determine based on the site version if /.api/client-config is available.
        return graphqlClient
            .getSiteVersion(signal)
            .then(siteVersion => {
                signal?.throwIfAborted()
                if (isError(siteVersion)) {
                    if (isAbortError(siteVersion)) {
                        throw siteVersion
                    }
                    logError(
                        'ClientConfigSingleton',
                        'Failed to determine site version, GraphQL error',
                        siteVersion
                    )
                    return false // assume /.api/client-config is not supported
                }

                // Insiders and dev builds support the new /.api/client-config endpoint
                const insiderBuild = siteVersion.length > 12 || siteVersion.includes('dev')
                if (insiderBuild) {
                    return true
                }

                // Sourcegraph instances before 5.5.0 do not support the new /.api/client-config endpoint.
                if (semver.lt(siteVersion, '5.5.0')) {
                    return false
                }
                return true
            })
            .then(supportsClientConfig => {
                signal?.throwIfAborted()

                // If /.api/client-config is not available, fallback to the myriad of GraphQL
                // requests that we previously used to determine the client configuration
                if (!supportsClientConfig) {
                    return this.fetchClientConfigLegacy(signal)
                }

                return graphqlClient
                    .fetchHTTP<CodyClientConfig>(
                        'client-config',
                        'GET',
                        '/.api/client-config',
                        undefined,
                        signal
                    )
                    .then(clientConfig => {
                        if (isError(clientConfig)) {
                            throw clientConfig
                        }
                        return clientConfig
                    })
            })
            .then(clientConfig => {
                signal?.throwIfAborted()
                logDebug('ClientConfigSingleton', 'refreshed', JSON.stringify(clientConfig))
                return clientConfig
            })
            .catch(e => {
                if (!isAbortError(e)) {
                    logError('ClientConfigSingleton', 'failed to refresh client config', e)
                }
                throw e
            })
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
            modelsAPIEnabled: false,
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
}
