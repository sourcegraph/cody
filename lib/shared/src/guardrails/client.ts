import type { SourcegraphGraphQLAPIClient } from '../sourcegraph-api/graphql'
import { isError } from '../utils'

import type { Attribution, Guardrails } from '.'
import { ClientConfigSingleton } from '../sourcegraph-api/graphql/client'

export class SourcegraphGuardrailsClient implements Guardrails {
    constructor(private client: SourcegraphGraphQLAPIClient) {}

    public async searchAttribution(snippet: string): Promise<Attribution | Error> {
        // Short-circuit attribution search if turned off in site config.
        const clientConfig = await ClientConfigSingleton.getInstance().getConfig()
        if (!clientConfig.attributionEnabled) {
            return new Error('Attribution search is turned off.')
        }
        const result = await this.client.searchAttribution(snippet)

        if (isError(result)) {
            return result
        }

        return {
            limitHit: result.limitHit,
            repositories: result.nodes.map(repo => ({ name: repo.repositoryName })),
        }
    }
}
