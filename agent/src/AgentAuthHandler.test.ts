import http from 'node:http'
import open from 'open'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { URI } from 'vscode-uri'
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
                'https://sourcegraph.test/user/settings/tokens/new/callback?requestFrom=JETBRAINS',
                'https://sourcegraph.test/user/settings/tokens/new/callback?requestFrom=JETBRAINS-123',
            ],
            [
                'valid endpointUri encoded',
                'https://sourcegraph.test/user/settings/tokens/new/callback?requestFrom%3DJETBRAINS',
                'https://sourcegraph.test/user/settings/tokens/new/callback?requestFrom=JETBRAINS-123',
            ],
            [
                'valid endpointUri with additional params appended',
                'https://sourcegraph.com/user/settings/tokens/new/callback?requestFrom=VISUAL_STUDIO',
                'https://sourcegraph.com/user/settings/tokens/new/callback?requestFrom=VISUAL_STUDIO-123',
            ],
            [
                'valid endpointUri with additional params appended and encoded',
                'https://sourcegraph.com/.auth/openidconnect/login?prompt_auth=github&pc=sams&redirect=%2Fuser%2Fsettings%2Ftokens%2Fnew%2Fcallback%3FrequestFrom%3DJETBRAINS%26tokenReceiverUrl%3Dhttp%253A%252F%252F127.0.0.1%253A51231%252Fabcabcabc',
                'https://sourcegraph.com/.auth/openidconnect/login?prompt_auth=github&pc=sams&redirect=%2Fuser%2Fsettings%2Ftokens%2Fnew%2Fcallback%3FrequestFrom%3DJETBRAINS-123%26tokenReceiverUrl%3Dhttp%253A%252F%252F127.0.0.1%253A51231%252Fabcabcabc',
            ],
            ['invalid IDE', 'https://sourcegraph.com', 'https://sourcegraph.com/'],
            ['invalid endpointUri', 'invalid-url', undefined],
        ])('%s', (_, endpointUri: string, expectedUrl?: string) => {
            const uri = endpointUri as unknown as URI

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
