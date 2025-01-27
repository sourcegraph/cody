import { Observable, map } from 'observable-fns'
import type { AuthCredentials, ClientConfiguration } from '../configuration'
import { logError } from '../logger'
import {
    distinctUntilChanged,
    firstValueFrom,
    fromLateSetSource,
    promiseToObservable,
} from '../misc/observable'
import { skipPendingOperation, switchMapReplayOperation } from '../misc/observableOperation'
import type { DefaultsAndUserPreferencesByEndpoint } from '../models/modelsService'
import { DOTCOM_URL } from '../sourcegraph-api/environments'
import { type PartialDeep, type ReadonlyDeep, isError } from '../utils'

/**
 * The input from various sources that is needed to compute the {@link ResolvedConfiguration}.
 */
export interface ConfigurationInput {
    clientConfiguration: ClientConfiguration
    clientSecrets: ClientSecrets
    clientState: ClientState
    reinstall: {
        isReinstalling(): Promise<boolean>
        onReinstall(): Promise<void>
    }
}

export interface ClientSecrets {
    getToken(endpoint: string): Promise<string | undefined>
}

export interface ClientState {
    lastUsedEndpoint: string | null
    anonymousUserID: string | null
    lastUsedChatModality: 'sidebar' | 'editor'
    modelPreferences: DefaultsAndUserPreferencesByEndpoint
    waitlist_o1: boolean | null
}

/**
 * The fully resolved configuration, which is what almost all callers should use.
 *
 * This combines information from various sources (see {@link ConfigurationInput}).
 */
export type ResolvedConfiguration = ReadonlyDeep<{
    configuration: ClientConfiguration
    auth: AuthCredentials
    clientState: ClientState
    isReinstall: boolean
}>

/**
 * The specification of which keys in the {@link ResolvedConfig} to use.
 *
 * @example `{ configuration: 'customHeaders'; auth: true }`, which means only the `customHeaders`
 * configuration key and the entire auth object.
 */
type KeysSpec = {
    [K in keyof ResolvedConfiguration]?: keyof ResolvedConfiguration[K] | true
}

/**
 * Type helper for a partial {@link ResolvedConfiguration}.
 *
 * @example `PickResolvedConfiguration<{ configuration: 'customHeaders'; auth: true }>`
 */
export type PickResolvedConfiguration<Keys extends KeysSpec> = {
    [K in keyof Keys & keyof ResolvedConfiguration]: Keys[K] extends keyof ResolvedConfiguration[K]
        ? Pick<ResolvedConfiguration[K], Keys[K]>
        : Keys[K] extends true
          ? ResolvedConfiguration[K]
          : undefined
}

async function resolveConfiguration({
    clientConfiguration,
    clientSecrets,
    clientState,
    reinstall: { isReinstalling, onReinstall },
}: ConfigurationInput): Promise<ResolvedConfiguration> {
    const isReinstall = await isReinstalling()
    if (isReinstall) {
        await onReinstall()
    }
    // we allow for overriding the server endpoint from config if we haven't
    // manually signed in somewhere else
    const serverEndpoint = normalizeServerEndpointURL(
        clientConfiguration.overrideServerEndpoint ||
            (clientState.lastUsedEndpoint ?? DOTCOM_URL.toString())
    )

    // We must not throw here, because that would result in the `resolvedConfig` observable
    // terminating and all callers receiving no further config updates.
    const loadTokenFn = () =>
        clientSecrets.getToken(serverEndpoint).catch(error => {
            logError(
                'resolveConfiguration',
                `Failed to get access token for endpoint ${serverEndpoint}: ${error}`
            )
            return null
        })
    const accessToken = clientConfiguration.overrideAuthToken || ((await loadTokenFn()) ?? null)
    return {
        configuration: clientConfiguration,
        clientState,
        auth: { accessToken, serverEndpoint },
        isReinstall,
    }
}

export function normalizeServerEndpointURL(url: string): string {
    return url.endsWith('/') ? url : `${url}/`
}

const _resolvedConfig = fromLateSetSource<ResolvedConfiguration>()

/**
 * Set the observable that will be used to provide the global {@link resolvedConfig}. This should be
 * set exactly once (except in tests).
 */
export function setResolvedConfigurationObservable(input: Observable<ConfigurationInput>): void {
    _resolvedConfig.setSource(
        input.pipe(
            switchMapReplayOperation(input => promiseToObservable(resolveConfiguration(input))),
            skipPendingOperation(),
            map(value => {
                if (isError(value)) {
                    throw value
                }
                return value
            }),
            distinctUntilChanged()
        ),
        false
    )
}

/**
 * Set the actual {@link ResolvedConfiguration} value to use. This should be called exactly once and
 * only from clients that can guarantee the configuration will not change during execution (such as
 * simple CLI commands).
 */
export function setStaticResolvedConfigurationValue(
    input: ResolvedConfiguration | Observable<ResolvedConfiguration>
): void {
    _resolvedConfig.setSource(input instanceof Observable ? input : Observable.of(input), false)
}

/**
 * The resolved configuration, which combines and resolves VS Code or other editor configuration,
 * authentication credentials, and other client state.
 *
 * This is the preferred way to retrieve the configuration from anywhere in the Cody codebase.
 * Because it returns an Observable and not just the current value, callers are able to react to
 * configuration changes. If a caller truly just needs the current value or has not been updated to
 * use an Observable, it can use {@link currentResolvedConfig} instead, but this often leads to
 * inconsistency bugs.
 *
 * It is intentionally global because editor configuration and client state are global anyway.
 *
 * It is OK to access this before {@link setResolvedConfigurationObservable} is called, but it will
 * not emit any values before then.
 */
export const resolvedConfig: Observable<ResolvedConfiguration> = _resolvedConfig.observable

/**
 * The current resolved configuration. Callers should use {@link resolvedConfig} instead so that
 * they react to configuration changes and do not (for example) require users to reload their editor
 * for configuration changes to take effect. This function is provided for old call sites that
 * haven't been updated to use an Observable.
 *
 * It is not possible to synchronously retrieve the configuration value because (1) it's not
 * available at initial startup and (2) resolving it is a fundamentally async operation because the
 * authentication credentials storage is async. In particular, callers should not try to get the
 * configuration in a class constructor synchronously because that almost certainly means that the
 * class will not react properly to configuration changes.
 */
export function currentResolvedConfig(): Promise<ResolvedConfiguration> {
    return firstValueFrom(resolvedConfig)
}

/**
 * Mock the {@link resolvedConfig} and {@link currentResolvedConfig} values.
 *
 * For use in tests only.
 */
export function mockResolvedConfig(value: PartialDeep<ResolvedConfiguration>): void {
    _resolvedConfig.setSource(
        Observable.of({
            configuration: {},
            auth: {},
            clientState: { modelPreferences: {} },
            ...value,
        } as ResolvedConfiguration),
        false
    )
}
