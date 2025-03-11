import { logDebug } from '../logger'
import { SourcegraphGraphQLAPIClient } from '../sourcegraph-api/graphql'
import type { APIResponse, GraphQLAPIClientConfig } from '../sourcegraph-api/graphql/client'
import * as gql from '../sourcegraph-api/graphql/dsl'

export class AuthSwitcher {
    async signOut(endpoint: string): Promise<void> {}

    async signIn(apiClientConfig: GraphQLAPIClientConfig, abortSignal: AbortSignal): Promise<void> {}
}

export class AuthAndConfiguration {
    private abortController = new AbortController()

    get signal(): AbortSignal {
        return this.abortController.signal
    }

    scopedCfg(): AuthAndConfiguration {
        throw new Error('NYI')
    }
}

export function newCfg<T>(fn: () => T): () => T {
    throw new Error('NYI')
}

// TODO:
// - Enlist the current "thread" in the configuration values it is reading.
// - Validate the read configuration when it is used.

const stack: AuthAndConfiguration[] = []

/// Gets the active configuration for the current task.
export function getCfg(): AuthAndConfiguration {
    const config = stack.at(-1)
    if (!config) {
        throw new Error('getConfig without an active context')
    }
    return config
}

/// Establishes `config` as the configuration for executing `fn`.
export function usingCfg<T>(config: AuthAndConfiguration, fn: () => T) {
    stack.push(config)
    try {
        return fn()
    } finally {
        if (stack.pop() !== config) {
            // biome-ignore lint/correctness/noUnsafeFinally: This is a programming error and we want to surface this.
            throw new Error('usingConfig tried to pop a corrupt context stack')
        }
    }
}

/// Passes the current task's configuration to `fn`. Use this to tie async callbacks into the same
/// configuration as the current task.
export function passCfg<T>(fn: () => Promise<T>): () => Promise<T> {
    const config = getCfg()
    return () => {
        stack.push(config)
        try {
            return fn()
        } finally {
            if (stack.pop() !== config) {
                // biome-ignore lint/correctness/noUnsafeFinally: This is a programming error and we want to surface this.
                throw new Error('withActiveContext tried to pop a corrupt context stack')
            }
        }
    }
}

export const queryPieces = {
    codeSearchEnabled: gql.labeled(
        'codeSearchEnabled',
        gql.args(gql.q.boolean('enterpriseLicenseHasFeature'), gql.constant('feature', 'code-search'))
    ),
    siteProductVersion: gql.nested('site', gql.q.string('productVersion')),
    viewerSettings: gql.nested('viewerSettings', gql.q.string('final')),
    currentUserInfo: gql.nested(
        'currentUser',
        gql.q.string('id'),
        gql.q.boolean('hasVerifiedEmail'),
        gql.q.string('displayName'),
        gql.q.string('username'),
        gql.q.string('avatarURL'),
        gql.nested('primaryEmail', gql.q.string('email')),
        gql.nested('organizations', gql.array('nodes', gql.q.string('id'), gql.q.string('name')))
    ),
}

// This is a stub for developing the config fetcher.
export async function TODOstub(apiClientConfig: GraphQLAPIClientConfig): Promise<void> {
    const abortController = new AbortController()
    const fetcher = new ConfigFetcher()
    fetcher.fetch(abortController.signal, apiClientConfig).then(console.log)
}

/// Authenticates with a Sourcegraph instance and retrieves product configuration.
/// Fetches the whole product configuration.
class ConfigFetcher {
    async fetch(abortSignal: AbortSignal, apiClientConfig: GraphQLAPIClientConfig): Promise<void> {
        try {
            const client = SourcegraphGraphQLAPIClient.withStaticConfig(apiClientConfig)

            // Make the initial query to establish the site version.
            const q1 = gql.prepare('0.0.0', queryPieces.siteProductVersion)
            const q1Result = await client.fetchSourcegraphAPI<APIResponse<gql.Realize<typeof q1.query>>>(
                q1.text!,
                {},
                abortSignal
            )
            if (q1Result instanceof Error) {
                throw q1Result
            }
            if (q1Result.errors) {
                throw new Error(q1Result.errors.map(error => error.message).join('\n'))
            }
            if (!q1Result.data) {
                throw new Error('No data')
            }
            const version = q1Result.data.site.productVersion

            const configQuery = gql.prepare(
                version,
                queryPieces.currentUserInfo,
                queryPieces.codeSearchEnabled,
                queryPieces.viewerSettings
            )
            logDebug('XXXDPC', configQuery.text!)
            const config1 = await client.fetchSourcegraphAPI<
                APIResponse<gql.Realize<typeof configQuery.query>>
            >(configQuery.text!, {}, abortSignal)
            // TODO: Classify errors:
            // - Transient
            // - Authorization failures
            // - Permanent
            if (config1 instanceof Error) {
                throw config1
            }
            // TODO, see lib/shared/src/sourcegraph-api/clientConfig.ts for viewerConfig handling
            // Note, viewerConfig used to be permissive about errors, it was probably added in some Sourcegraph version.
            logDebug('XXXDPC', JSON.stringify(config1))
        } catch (e: any) {
            logDebug('XXXDPC', e.toString())
        }
    }
}
