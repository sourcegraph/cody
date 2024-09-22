import { map } from 'observable-fns'
import semver from 'semver'
import { authStatus, currentAuthStatusOrNotReadyYet } from '../auth/authStatus'
import type { AuthStatus } from '../auth/types'
import { dependentAbortController } from '../common/abortController'
import { logDebug, logError } from '../logger'
import {
    type Unsubscribable,
    abortableOperation,
    debounceTime,
    distinctUntilChanged,
} from '../misc/observable'
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

class AuthStatusChangedError extends Error {}

/**
 * ClientConfigSingleton is a class that manages the retrieval
 * and caching of configuration features from GraphQL endpoints.
 */
export class ClientConfigSingleton {
    private static instance: ClientConfigSingleton

    public static readonly CACHE_TTL = 60 * 1000
    private cachedValue: {
        value: CodyClientConfig
        stale: boolean
        timeoutHandle: ReturnType<typeof setTimeout> | null
    } | null = null

    // Default values for the legacy GraphQL features API, used when a Sourcegraph instance
    // does not support even the legacy GraphQL API.
    private featuresLegacy: CodyConfigFeatures = {
        chat: true,
        autoComplete: true,
        commands: true,
        attribution: false,
    }

    private configSubscription: Unsubscribable

    // Constructor is private to prevent creating new instances outside of the class
    private constructor() {
        this.configSubscription = authStatus
            .pipe(
                map(
                    authStatus =>
                        ({
                            authenticated: authStatus.authenticated,
                            endpoint: authStatus.endpoint,
                        }) satisfies Pick<AuthStatus, 'authenticated' | 'endpoint'>
                ),
                debounceTime(0),
                distinctUntilChanged(),
                abortableOperation(async (authStatus, signal) => {
                    this.inflightRefreshConfig?.abort(
                        new AuthStatusChangedError('invalidate due to authStatus change')
                    )
                    this.inflightRefreshConfigPromise = null
                    this.setCachedValue(null)

                    if (authStatus.authenticated) {
                        await this.refreshConfig(signal).catch(() => {})
                    }
                })
            )
            .subscribe({})
    }

    public dispose(): void {
        this.configSubscription.unsubscribe()
    }

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
        try {
            switch (await this.shouldFetch()) {
                case 'sync':
                    try {
                        return await this.refreshConfig(signal)
                    } catch (error) {
                        // HACK(sqs): Try again in case of an authStatus change.
                        if (error instanceof AuthStatusChangedError) {
                            return await this.refreshConfig(signal)
                        }
                        throw error
                    }
                // biome-ignore lint/suspicious/noFallthroughSwitchClause: This is intentional
                case 'async':
                    this.refreshConfig(signal).catch(() => {})
                case false:
                    return this.cachedValue?.value ?? undefined
            }
        } catch {
            return
        }
    }

    // Refetch the config if the user is signed in and it's not cached or it's older than 60 seconds
    // If the cached config is >60s old, then we will refresh it async now. In the meantime, we will
    // continue using the old version.
    //
    // Note that this means the time allowance between 'site admin disabled <chat,autocomplete,commands,etc.>
    // functionality but users can still make use of it' is double this (120s.)
    private async shouldFetch(): Promise<'sync' | 'async' | false> {
        // If the user is not logged in, we will not fetch as it will fail
        if (!currentAuthStatusOrNotReadyYet()?.authenticated) {
            return false
        }

        // If they are logged in but not cached, fetch the config synchronously
        if (!this.cachedValue) {
            return 'sync'
        }

        // If the config is cached and stale, we can use the cached version
        // but should asyncronously fetch the new config
        if (this.cachedValue.stale) {
            return 'async'
        }

        // Otherwise, we have a cache hit!
        return false
    }

    private inflightRefreshConfig: AbortController | null = null
    private inflightRefreshConfigPromise: Promise<CodyClientConfig> | null = null

    // Refreshes the config features by fetching them from the server and caching the result
    private async refreshConfig(signal?: AbortSignal): Promise<CodyClientConfig> {
        if (this.inflightRefreshConfigPromise) {
            return this.inflightRefreshConfigPromise
        }

        if (this.inflightRefreshConfig) {
            this.inflightRefreshConfig.abort()
        }
        const abortController = dependentAbortController(signal)
        this.inflightRefreshConfig = abortController

        signal = abortController.signal

        logDebug('ClientConfigSingleton', 'refreshing configuration')

        // Determine based on the site version if /.api/client-config is available.
        const promise = graphqlClient
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
                this.setCachedValue(clientConfig)
                return clientConfig
            })
            .catch(e => {
                if (!isAbortError(e)) {
                    logError('ClientConfigSingleton', 'failed to refresh client config', e)
                }
                throw e
            })
            .finally(() => {
                if (this.inflightRefreshConfigPromise === promise) {
                    this.inflightRefreshConfigPromise = null
                }
                if (this.inflightRefreshConfig === abortController) {
                    this.inflightRefreshConfig = null
                }
            })
        this.inflightRefreshConfigPromise = promise
        return this.inflightRefreshConfigPromise
    }

    public setCachedValue(value: CodyClientConfig | null): void {
        // Clear prior value and its eviction timer.
        if (this.cachedValue) {
            if (this.cachedValue.timeoutHandle) {
                clearTimeout(this.cachedValue.timeoutHandle)
            }
        }

        this.cachedValue = null
        if (value) {
            const cacheEntry: NonNullable<ClientConfigSingleton['cachedValue']> = {
                value,
                stale: false,
                timeoutHandle: setTimeout(() => {
                    cacheEntry.stale = true
                }, ClientConfigSingleton.CACHE_TTL),
            }
            this.cachedValue = cacheEntry
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
