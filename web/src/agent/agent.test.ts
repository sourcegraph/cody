import '@vitest/web-worker'
import { describe, expect, test, vi } from 'vitest'
import { createAgentClient } from './client'

vi.mock('../../../vscode/src/models', () => ({
    chatModel: {
        get: () => {
            return 'my-model'
        },
        set: () => {},
    },
}))

describe('agent web worker', () => {
    test('creates', async () => {
        // TODO(sqs): broken
        const agent = await createAgentClient({
            serverEndpoint: 'https://example.com',
            accessToken: 'asdf',
            workspaceRootUri: 'file:///tmp/foo',
        })
        const id = await agent.rpc.sendRequest('chat/new')
        const UUID = /^[0-9a-f-]{36}$/
        expect(id).toMatch(UUID)
    })
})
