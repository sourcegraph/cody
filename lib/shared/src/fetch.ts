import type { Agent as AgentBase } from 'agent-base'
/**
 * By hard-requiring isomorphic-fetch, we ensure that even in newer Node environments that include
 * `fetch` by default, we still use the `node-fetch` polyfill and have access to the networking code
 */
import isomorphicFetch from 'isomorphic-fetch'
import {
    type BrowserOrNodeResponse,
    addCustomUserAgent,
    customUserAgent,
} from './sourcegraph-api/graphql/client'

let _globalAgent: AgentBase | undefined
let _blockEarlyAccess = false
export const globalAgentRef = {
    get curr() {
        if (_blockEarlyAccess && !_globalAgent) {
            return undefined
            // throw new Error('Agent was used before it was initialized')
        }
        return _globalAgent
    },

    set curr(v: AgentBase | undefined) {
        //TODO: Maybe we only want to allow this once!
        _globalAgent = v
    },

    set blockEarlyAccess(v: boolean) {
        _blockEarlyAccess = v
    },

    get isSet() {
        return _globalAgent !== undefined
    },
}

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
// export const agent:
//     | { current: undefined; _forceCodyProxy?: undefined }
//     | {
//           current: (req?: Partial<ClientRequest>, opts?: Partial<RequestOptions>) => Agent | AgentBase
//           _forceCodyProxy?: boolean | undefined
//       } = { current: undefined }

/**
 * Set this on
 */

export function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<BrowserOrNodeResponse> {
    if (customUserAgent) {
        init = init ?? {}
        const headers = new Headers(init?.headers)
        addCustomUserAgent(headers)
        init.headers = headers
    }

    const initWithAgent: RequestInit & { agent: typeof globalAgentRef.curr } = {
        ...init,
        agent: globalAgentRef.curr,
    }
    return isomorphicFetch(input, initWithAgent)
}
