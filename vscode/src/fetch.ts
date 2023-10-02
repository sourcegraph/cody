import type { Agent } from 'http'

/**
 * By hard-requiring isomorphic-fetch, we ensure that even in newer Node environments that include
 * `fetch` by default, we still use the `node-fetch` polyfill and have access to the networking code
 */
import isomorphicFetch from 'isomorphic-fetch'
import type { Response as NodeResponse } from 'node-fetch'

import { addCustomUserAgent, customUserAgent } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'

/**
 * In node environments, it might be necessary to set up a custom agent to control the network
 * requests being made.
 *
 * To do this, we have a mutable agent variable that can be set to an instance of `http.Agent` or
 * `https.Agent` (depending on the protocol of the URL) but that will be kept undefined for web
 * environments.
 *
 * Agent is a mutable ref so that we can override it from `fetch.node.ts`
 */
export const agent: { current: ((url: URL) => Agent) | undefined } = { current: undefined }

export type BrowserOrNodeResponse = Response | NodeResponse

export function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<BrowserOrNodeResponse> {
    if (customUserAgent) {
        init = init ?? {}
        const headers = new Headers(init?.headers)
        addCustomUserAgent(headers)
        init.headers = headers
    }
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return isomorphicFetch(input, {
        ...init,
        agent: agent.current,
    } as RequestInit)
}
