import { SourcegraphGraphQLAPIClient } from '../sourcegraph-api/graphql'

import { Attribution, Guardrails } from '.'

export class SourcegraphGuardrailsClient implements Guardrails {
    constructor(private client: SourcegraphGraphQLAPIClient) {}

    public async searchAttribution(snippet: string): Promise<Attribution | Error> {
        return new Promise<Attribution | Error>(resolve => resolve({ limitHit: true, repositories: [] }))
        // const result = await this.client.searchAttribution(snippet)

        // if (isError(result)) {
        //     return result
        // }

        // return {
        //     limitHit: result.limitHit,
        //     repositories: result.nodes.map(repo => ({ name: repo.repositoryName })),
        // }
    }
}
