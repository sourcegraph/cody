import type { LayoutLoad } from './$types'

import { createAgentClient } from '@sourcegraph/cody-web/lib/agent/agent.client'
// @ts-ignore
import AgentWorker from '@sourcegraph/cody-web/lib/agent/agent.worker?worker'

const CREATE_AGENT_WORKER = (): Worker => new AgentWorker() as Worker

export const load: LayoutLoad = async () => {
    const agentClient = createAgentClient({
        serverEndpoint: 'https://sourcegraph.test:3443',
        accessToken: 'my-access-token',
        createAgentWorker: CREATE_AGENT_WORKER,
    })
    return {
        agentClient,
    }
}

export const ssr = false
