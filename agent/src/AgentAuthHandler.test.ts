import http from 'node:http'
import open from 'open'
import { describe, expect, it, vi } from 'vitest'
import { AgentAuthHandler } from './AgentAuthHandler'

vi.mock('open')
vi.mock('node:http', () => ({
    default: {
        createServer: vi.fn().mockReturnValue({
            listen: vi.fn().mockImplementation((port, callback) => {
                callback()
            }),
            on: vi.fn(),
        }),
    },
}))

describe('AgentAuthHandler', () => {
    describe('redirectToEndpointLoginPage', () => {
        /**
         * Tests the redirectToEndpointLoginPage function of the AgentAuthHandler class.
         * This function constructs a callback URI with a Cody auth referral code and server port,
         * then opens the URI in the user's default web browser.
         *
         * The test cases cover:
         * - When a valid endpointUri is set, the correct callback URI is constructed and opened.
         * - When endpointUri is null, nothing happens (open is not called).
         */
        it.each([
            [
                'valid endpointUri for JetBrains',
                'JetBrains',
                'https://sourcegraph.test',
                'https://sourcegraph.test/user/settings/tokens/new/callback?requestFrom=CODY_JETBRAINS-43452',
            ],
            [
                'valid endpointUri for VisualStudio',
                'VisualStudio',
                'https://sourcegraph.com',
                'https://sourcegraph.com/user/settings/tokens/new/callback?requestFrom=VISUAL_STUDIO-43452',
            ],
            ['invalid IDE', 'Sublime', 'https://sourcegraph.com', undefined],
            ['invalid endpointUri', 'Web', '', undefined],
        ])('%s', (_: string, IDE: string, endpointUri: string, expectedUrl?: string) => {
            const agentAuthHandler = new AgentAuthHandler(IDE)
            agentAuthHandler.setTokenCallbackHandler(() => {})
            if (!expectedUrl) {
                expect(() => agentAuthHandler.redirectToEndpointLoginPage(endpointUri)).toThrow(
                    'Failed to construct callback URL'
                )
            } else {
                agentAuthHandler.redirectToEndpointLoginPage(endpointUri)
                expect(http.createServer).toHaveBeenCalled()
                expect(open).toHaveBeenCalledWith(expectedUrl)
            }
        })
    })
})
