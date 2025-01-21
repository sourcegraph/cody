import * as https from 'node:https'
import { HttpsProxyAgent } from 'hpagent'
import { describe, expect, test, vi } from 'vitest'
import { DelegatingAgent } from './DelegatingAgent'

vi.mock('@sourcegraph/cody-shared', async () => {
    const actual = await vi.importActual('@sourcegraph/cody-shared')
    return {
        ...actual,
        globalAgentRef: {
            isSet: false,
            agent: undefined,
        },
    }
})

// Mock Socket as before
vi.mock('node:net', () => ({
    Socket: vi.fn(() => ({
        connect: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
    })),
}))

// Mock TLS as before
vi.mock('node:tls', () => ({
    connect: vi.fn(() => ({
        end: vi.fn(),
        destroy: vi.fn(),
    })),
    rootCertificates: [],
}))

// Mock the entire https.request
vi.mock('node:https', async () => {
    const actual = await vi.importActual('node:https')
    return {
        ...actual,
        request: vi.fn(() => ({
            on: vi.fn(),
            end: vi.fn(),
            destroy: vi.fn(),
        })),
    }
})

describe.sequential('DelegatingAgent caching', () => {
    test('reuses cached agents for identical requests', async () => {
        const agent = await DelegatingAgent.initialize({})

        const requestOptions = {
            host: 'api.example.com',
            port: 443,
            protocol: 'https:',
            method: 'GET',
            path: '/',
            headers: {},
            secureEndpoint: true,
        }

        // First connection should create a new agent
        const agent1 = await agent.connect(https.request(requestOptions), requestOptions)

        // Second connection to same endpoint should return cached agent
        const agent2 = await agent.connect(https.request(requestOptions), requestOptions)

        // Verify same agent instance is returned
        expect(agent1).toBe(agent2)

        // Different endpoint should create new agent
        const differentRequestOptions = {
            ...requestOptions,
            host: 'different.example.com',
        }
        const agent3 = await agent.connect(
            https.request(differentRequestOptions),
            differentRequestOptions
        )

        expect(agent3).not.toBe(agent1)

        agent.dispose()
    })

    test('respects CODY_NODE_DEFAULT_PROXY and CODY_NODE_NO_PROXY', async () => {
        vi.stubEnv('CODY_NODE_DEFAULT_PROXY', 'http://proxy.example.com:8080')
        vi.stubEnv('CODY_NODE_NO_PROXY', 'localhost,internal.example.com,*.other.com,.other2.com')

        const agent = await DelegatingAgent.initialize({})

        // Test request that should be proxied
        const proxyRequest = {
            host: 'api.example.com',
            port: 443,
            protocol: 'https:',
            method: 'GET',
            path: '/',
            headers: {},
            secureEndpoint: true,
        }

        // Test request that should not be proxied (matches NO_PROXY)
        const noProxyRequest = {
            host: 'internal.example.com',
            port: 443,
            protocol: 'https:',
            method: 'GET',
            path: '/',
            headers: {},
            secureEndpoint: true,
        }

        const wildcardNoProxyRequest = {
            host: 'subdomain.other.com',
            port: 443,
            protocol: 'https:',
            method: 'GET',
            path: '/subpath',
            headers: {},
            secureEndpoint: true,
        }

        const dotNoProxyRequest = {
            host: 'subdomain.other2.com',
            port: 443,
            protocol: 'https:',
            method: 'GET',
            path: '/subpath',
            headers: {},
            secureEndpoint: true,
        }

        const proxiedAgent = await agent.connect(https.request(proxyRequest), proxyRequest)
        const noProxiedAgent = await agent.connect(https.request(noProxyRequest), noProxyRequest)
        const wildcardNoProxyAgent = await agent.connect(
            https.request(wildcardNoProxyRequest),
            wildcardNoProxyRequest
        )
        const dotNoProxyAgent = await agent.connect(https.request(dotNoProxyRequest), dotNoProxyRequest)

        // Verify different agents are used
        expect(proxiedAgent).instanceOf(HttpsProxyAgent)

        // Check that these are normal https Agents (e.g. not a subclass)
        expect(noProxiedAgent.constructor).toBe(https.Agent)
        expect(wildcardNoProxyAgent.constructor).toBe(https.Agent)
        expect(dotNoProxyAgent.constructor).toBe(https.Agent)

        // They shouldn't use the same agent
        expect(noProxiedAgent).not.toBe(wildcardNoProxyAgent)
        expect(noProxiedAgent).not.toBe(dotNoProxyAgent)
        expect(wildcardNoProxyAgent).not.toBe(dotNoProxyAgent)

        // Clean up
        agent.dispose()
        vi.unstubAllEnvs()
    })
})
