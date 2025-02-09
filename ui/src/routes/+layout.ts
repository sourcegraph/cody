import { createInteractiveThreadService, localStorageThreadStorage } from '@sourcegraph/cody-shared'
import type { LayoutLoad } from './$types'

import { createAgentClient } from '@sourcegraph/cody-web/lib/agent/agent.client'
// @ts-ignore
import AgentWorker from '@sourcegraph/cody-web/lib/agent/agent.worker?worker'

const CREATE_AGENT_WORKER = (): Worker => new AgentWorker() as Worker

const useAgent = true

export const load: LayoutLoad = async () => {
    const agentClient = useAgent
        ? await createAgentClient({
              serverEndpoint: 'https://sourcegraph.test:3443',
              // TODO!(sqs)
              //
              // localStorage.accessToken='foo';location.reload()
              accessToken: localStorage.getItem('accessToken') ?? '',
              createAgentWorker: CREATE_AGENT_WORKER,
          })
        : null
    const chat = await agentClient?.rpc.sendRequest<{ panelId: string; chatId?: string }>(
        'chat/web/new',
        null
    )

    const threadService = createInteractiveThreadService(localStorageThreadStorage(window.localStorage))

    return {
        agentClient,
        threadService,
    }
}

export const ssr = false
