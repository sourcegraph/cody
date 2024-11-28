/**
 * By hard-requiring isomorphic-fetch, we ensure that even in newer Node environments that include
 * `fetch` by default, we still use the `node-fetch` polyfill and have access to the networking code
 */
import isomorphicFetch from 'isomorphic-fetch'
import { globalAgentRef } from './fetch.patch'
import { addCodyClientIdentificationHeaders } from './sourcegraph-api/client-name-version'
export * from './fetch.patch'

export function fetch(input: URL | RequestInfo, init?: RequestInit): Promise<Response> {
    init = init ?? {}
    const headers = new Headers(init?.headers)
    addCodyClientIdentificationHeaders(headers)
    init.headers = headers

    const initWithAgent: RequestInit & { agent: typeof globalAgentRef.agent } = {
        ...init,
        agent: globalAgentRef.agent,
    }

    const isNode = typeof process !== 'undefined'
    const fetchImpl = isNode ? globalThis.fetch : isomorphicFetch
    return fetchImpl(input, initWithAgent)
}
