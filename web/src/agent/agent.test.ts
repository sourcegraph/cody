import '@vitest/web-worker'
import { describe, expect, test } from 'vitest'
import { createAgentClient } from './client'

describe('agent web worker', () => {
    test('creates', async () => {
        // TODO(sqs): broken
        const agent = await createAgentClient({
            serverEndpoint: 'https://example.com',
            accessToken: 'asdf',
            workspaceRootUri: 'file:///tmp/foo',
        })
        const id = await agent.rpc.sendRequest('chat/new')
        expect(id).toBe('123')
    })
})
