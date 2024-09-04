import http from 'node:http'
import open from 'open'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { URI } from 'vscode-uri'
import { AgentAuthHandler } from './AgentAuthHandler'

vi.mock('open')
vi.mock('node:http', () => ({
    default: {
        createServer: vi.fn().mockReturnValue({
            listen: vi.fn().mockImplementation((port, uri, callback) => {
                callback()
            }),
            on: vi.fn(),
            address: vi.fn().mockReturnValue({ port: 123 }),
        }),
    },
}))

describe('AgentAuthHandler', () => {
    let agentAuthHandler: AgentAuthHandler

    beforeEach(() => {
        agentAuthHandler = new AgentAuthHandler()
        agentAuthHandler.setTokenCallbackHandler(uri => console.log(`Token received: ${uri}`))
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    describe('handleCallback', () => {
        it.each([
            [
                'valid endpointUri',
                'https://sourcegraph.test/user/settings/tokens/new/callback?requestFrom=CODY_JETBRAINS',
                'https://sourcegraph.test/user/settings/tokens/new/callback?requestFrom=CODY_JETBRAINS-123',
            ],
            [
                'valid endpointUri with additional params appended',
                'https://sourcegraph.com/user/settings/tokens/new/callback?requestFrom=VISUAL_STUDIO&tokenReceiverUrl=https%3A%2F%2Fexample.com',
                'https://sourcegraph.com/user/settings/tokens/new/callback?requestFrom=VISUAL_STUDIO-123&tokenReceiverUrl=https%3A%2F%2Fexample.com',
            ],
            ['invalid IDE', 'https://sourcegraph.com', 'https://sourcegraph.com/'],
            ['invalid endpointUri', 'invalid-url', undefined],
        ])('%s', (_, endpointUri: string, expectedUrl?: string) => {
            const uri = URI.parse(endpointUri)

            agentAuthHandler.handleCallback(uri)

            if (!expectedUrl) {
                expect(http.createServer).not.toHaveBeenCalled()
            } else {
                expect(http.createServer).toHaveBeenCalled()
                expect(open).toHaveBeenCalledWith(expect.stringContaining(expectedUrl))
            }
        })
    })
})
