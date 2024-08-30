import { type Observable, map } from 'observable-fns'
import type { AuthCredentials, ClientConfiguration } from '../configuration'
import { DOTCOM_URL } from '../sourcegraph-api/environments'

/**
 * The input from various sources that is needed to compute the {@link ResolvedConfiguration}.
 */
export interface ConfigurationInput {
    clientConfiguration: ClientConfiguration
    clientSecrets: ClientSecrets
    clientState: ClientState
    serverOverrides: ServerOverrides
}

export interface ClientSecrets {
    getToken(endpoint: string): Promise<string | undefined>
}

export interface ClientState {
    lastUsedEndpoint: string | null
    anonymousUserID: string
    lastUsedChatModality: 'sidebar' | 'editor'
}

type ServerOverrides = Record<string, never> // TODO!(sqs)

/**
 * The fully resolved configuration, which is what almost all callers should use.
 *
 * This combines information from various sources (see {@link ConfigurationInput}).
 */
export interface ResolvedConfiguration {
    configuration: ClientConfiguration
    auth: AuthCredentials
    clientState: ClientState
}

async function resolveConfiguration(input: ConfigurationInput): Promise<ResolvedConfiguration> {
    const serverEndpoint = input.clientState.lastUsedEndpoint ?? DOTCOM_URL.toString()
    const accessToken = (await input.clientSecrets.getToken(serverEndpoint)) ?? null
    return {
        // TODO!(sqs): apply serverOverrides
        configuration: input.clientConfiguration,
        clientState: input.clientState,

        // TODO!(sqs): get customHeaders
        auth: { accessToken, serverEndpoint },
    }
}

export function createResolvedConfigurationObservable(
    input: Observable<ConfigurationInput>
): Observable<ResolvedConfiguration> {
    return input.pipe(map(resolveConfiguration))
}
