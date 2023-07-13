import { Command } from 'commander'

import { CodebaseContext } from '@sourcegraph/cody-shared/src/codebase-context'
import { IntentDetector } from '@sourcegraph/cody-shared/src/intent-detector'
import { SourcegraphIntentDetectorClient } from '@sourcegraph/cody-shared/src/intent-detector/client'
import { SourcegraphCompletionsClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/client'
import { SourcegraphNodeCompletionsClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/nodeClient'
import { SourcegraphGraphQLAPIClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql'
import { isRepoNotFoundError } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'

import { GlobalOptions } from '../program'

import { createCodebaseContext } from './context'

export interface Client {
    codebaseContext: CodebaseContext
    intentDetector: IntentDetector
    completionsClient: SourcegraphCompletionsClient
}

export async function getClient(program: Command): Promise<Client> {
    const { codebase, endpoint, context: contextType, debug } = program.optsWithGlobals<GlobalOptions>()

    const accessToken: string | undefined = process.env.SRC_ACCESS_TOKEN
    if (accessToken === undefined || accessToken === '') {
        console.error(
            'No access token found. Set SRC_ACCESS_TOKEN to an access token created on the Sourcegraph instance.'
        )
        process.exit(1)
    }

    const sourcegraphClient = new SourcegraphGraphQLAPIClient({
        serverEndpoint: endpoint,
        accessToken,
        customHeaders: {},
    })

    let codebaseContext: CodebaseContext
    try {
        codebaseContext = await createCodebaseContext(sourcegraphClient, codebase, contextType, endpoint)
    } catch (error) {
        let errorMessage = ''
        if (isRepoNotFoundError(error)) {
            errorMessage =
                `Cody could not find the '${codebase}' repository on your Sourcegraph instance.\n` +
                'Please check that the repository exists and is entered correctly in the cody.codebase setting.'
        } else {
            errorMessage =
                `Cody could not connect to your Sourcegraph instance: ${error}\n` +
                'Make sure that cody.serverEndpoint is set to a running Sourcegraph instance and that an access token is configured.'
        }
        console.error(errorMessage)
        process.exit(1)
    }

    const intentDetector = new SourcegraphIntentDetectorClient(sourcegraphClient)

    const completionsClient = new SourcegraphNodeCompletionsClient({
        serverEndpoint: endpoint,
        accessToken,
        debugEnable: debug,
        customHeaders: {},
    })

    return { codebaseContext, intentDetector, completionsClient }
}
