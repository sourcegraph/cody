/**
 * By hard-requiring isomorphic-fetch, we ensure that even in newer Node environments that include
 * `fetch` by default, we still use the `node-fetch` polyfill and have access to the networking code
 */
import isomorphicFetch from 'isomorphic-fetch'
import { globalAgentRef } from './fetch.patch'
import {
    type BrowserOrNodeResponse,
    addCustomUserAgent,
    customUserAgent,
} from './sourcegraph-api/graphql/client'
export * from './fetch.patch'

export function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<BrowserOrNodeResponse> {
    if (customUserAgent) {
        init = init ?? {}
        const headers = new Headers(init?.headers)
        addCustomUserAgent(headers)
        init.headers = headers
    }

    const initWithAgent: RequestInit & { agent: typeof globalAgentRef.agent } = {
        ...init,
        agent: globalAgentRef.agent,
    }
    return isomorphicFetch(input, initWithAgent)
}
