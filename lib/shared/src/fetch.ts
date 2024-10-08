/**
 * By hard-requiring isomorphic-fetch, we ensure that even in newer Node environments that include
 * `fetch` by default, we still use the `node-fetch` polyfill and have access to the networking code
 */
import isomorphicFetch from 'isomorphic-fetch'
import { globalAgentRef } from './fetch.patch'
import { addCodyClientIdentificationHeaders } from './sourcegraph-api/client-name-version'
import type { BrowserOrNodeResponse } from './sourcegraph-api/graphql/client'
export * from './fetch.patch'

export function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<BrowserOrNodeResponse> {
    init = init ?? {}
    const headers = new Headers(init?.headers)
    addCodyClientIdentificationHeaders(headers)
    init.headers = headers

    const initWithAgent: RequestInit & { agent: typeof globalAgentRef.curr } = {
        ...init,
        agent: globalAgentRef.curr,
    }
    return isomorphicFetch(input, initWithAgent)
}
