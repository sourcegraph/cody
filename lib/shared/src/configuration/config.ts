import * as gql from '../sourcegraph-api/graphql/dsl'
import {SourcegraphGraphQLAPIClient} from "../sourcegraph-api/graphql";
import {GraphQLAPIClientConfig} from "../sourcegraph-api/graphql/client";
import {logDebug} from '../logger'

const queryPieces = {
    codeSearchEnabled: gql.labeled('codeSearchEnabled', gql.args(gql.q.boolean('enterpriseLicenseHasFeature'), gql.constant('feature', 'code-search'))),
    // TODO: For fields added in such-and-such a version, let's add a combinator for filtering by version.
    viewerSettings: gql.nested('viewerSettings', gql.q.string('final')),
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
            const configQuery = gql.prepare(queryPieces.codeSearchEnabled, queryPieces.viewerSettings)
            logDebug('XXXDPC', configQuery.text)
            const config1 = await client.fetchSourcegraphAPI<gql.Realize<typeof configQuery.query>>(configQuery.text, {}, abortSignal)
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
