import crypto from 'node:crypto'
/**
 * By hard-requiring isomorphic-fetch, we ensure that even in newer Node environments that include
 * `fetch` by default, we still use the `node-fetch` polyfill and have access to the networking code
 */
import isomorphicFetch from 'isomorphic-fetch'
import { globalAgentRef } from './fetch.patch'
import { addCodyClientIdentificationHeaders } from './sourcegraph-api/client-name-version'
import type { BrowserOrNodeResponse } from './sourcegraph-api/graphql/client'
export * from './fetch.patch'

// Request tracker to associate responses with their requests
interface RequestTracking {
    id: string
    url: string
    method: string
    startTime: number
}

// Map to store request tracking information - use BrowserOrNodeResponse type
export const requestTracker = new Map<BrowserOrNodeResponse, RequestTracking>()

export function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<BrowserOrNodeResponse> {
    init = init ?? {}
    const headers = new Headers(init?.headers)
    addCodyClientIdentificationHeaders(headers)

    // Generate a request ID
    const requestId = crypto.randomUUID()

    // Add request ID as a custom header for tracking
    headers.set('x-request-id', requestId)
    init.headers = headers

    const initWithAgent: RequestInit & {
        agent: typeof globalAgentRef.agent
    } = {
        ...init,
        agent: globalAgentRef.agent,
    }

    // Track information about this request
    const requestInfo = {
        id: requestId,
        url: typeof input === 'string' ? input : input.toString(),
        method: init.method || 'GET',
        startTime: performance.now(),
    }

    // Make the request and associate tracking info with the response
    return isomorphicFetch(input, initWithAgent).then(response => {
        // Store the request tracking information with the response as the key
        requestTracker.set(response, requestInfo)

        // Also attach the request ID to the response object for easier access
        // This is a non-standard addition but helps with our internal tracking
        ;(response as any)._codyRequestId = requestId

        return response
    })
}
