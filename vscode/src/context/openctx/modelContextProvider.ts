import proxy from '@openctx/provider-modelcontextprotocoltools'

import { MODEL_CONTEXT_PROVIDER_URI } from '@sourcegraph/cody-shared'
import type { OpenCtxProvider } from './types'

export function createModelContextProvider(modelContextProviderToolsURI: string): OpenCtxProvider {
    return {
        providerUri: MODEL_CONTEXT_PROVIDER_URI,

        async meta() {
            const client = await proxy.meta!(
                {},
                {
                    'mcp.provider.uri': modelContextProviderToolsURI,
                    'mcp.provider.args': [],
                }
            )
            return {
                name: client.name,
                mentions: { label: client.name ?? 'Select a tool' },
            }
        },

        // returns a list of available tools in MCP
        async mentions({ query }) {
            const items = await proxy.mentions!({ query: query }, {})
            return items
        },

        // returns the result of calling a speciic tool of MCP
        async items({ mention }) {
            const items = await proxy.items!({ mention }, {})
            return items
        },
    }
}
