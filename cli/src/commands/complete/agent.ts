import { Agent } from '@sourcegraph/cody-agent/src/agent'
import { AutocompleteParams, AutocompleteResult } from '@sourcegraph/cody-agent/src/protocol'

export interface CodyAgentCompleteParams {
    filePath: string
    content: string
    position: AutocompleteParams['position']
}

export async function codyAgentComplete({
    filePath,
    content,
    position,
}: CodyAgentCompleteParams): Promise<AutocompleteResult> {
    const agent = new Agent()
    await agent.request('initialize', {
        name: 'cody-cli',
        version: '0.0.1',
        workspaceRootUri: 'file://tmp',
        extensionConfiguration: {
            accessToken: process.env.SRC_ACCESS_TOKEN ?? 'invalid',
            serverEndpoint: process.env.SRC_ENDPOINT ?? 'invalid',
            customHeaders: {},
        },
    })
    agent.notify('textDocument/didOpen', { filePath, content })
    return agent.request('autocomplete/execute', {
        filePath,
        position,
    })
}
