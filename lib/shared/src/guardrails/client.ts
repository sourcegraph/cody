import type { Attribution } from '.'
import { GuardrailsMode } from '.'
import { currentResolvedConfig } from '../configuration/resolver'
import { ClientConfigSingleton } from '../sourcegraph-api/clientConfig'
import { graphqlClient } from '../sourcegraph-api/graphql/client'
import { isError } from '../utils'

// 10s timeout is enough to serve most attribution requests.
// It's a better user experience for chat attribution to wait
// a few seconds more and get attribution result.
const defaultTimeoutSeconds = 10

/**
 * This defines the user controllable configuration. Note: enablement is
 * controlled serverside.
 */
export interface GuardrailsClientConfig {
    experimentalGuardrailsTimeoutSeconds: number | undefined
}

export class SourcegraphGuardrailsClient {
    public async searchAttribution(snippet: string): Promise<Attribution | Error> {
        if (![GuardrailsMode.Permissive, GuardrailsMode.Enforced].includes(await this.getMode())) {
            return new Error('Attribution search is turned off.')
        }

        const timeout =
            ((await currentResolvedConfig()).configuration.experimentalGuardrailsTimeoutSeconds ??
                defaultTimeoutSeconds) * 1000

        const result = await graphqlClient.searchAttribution(snippet, AbortSignal.timeout(timeout))

        if (isError(result)) {
            return result
        }

        return {
            limitHit: result.limitHit,
            repositories: result.nodes.map(repo => ({ name: repo.repositoryName })),
        }
    }

    public async getMode(): Promise<GuardrailsMode> {
        const clientConfig = await ClientConfigSingleton.getInstance().getConfig()
        switch (clientConfig?.attribution) {
            case 'enforced':
                return GuardrailsMode.Enforced
            case 'permissive':
                return GuardrailsMode.Permissive
            case 'none':
            case undefined:
                return GuardrailsMode.Off
            default:
                throw new Error(`unrecognized attribution mode: ${clientConfig?.attribution}`)
        }
    }
}
