import { describe, expect, it, vi } from 'vitest'
import { SourcegraphGraphQLAPIClient } from '../..'
import * as fetchModule from '../../fetch'
import { NeedsAuthChallengeError } from '../errors'

vi.mocked(fetchModule)

describe('SourcegraphGraphQLClient', () => {
    const client = SourcegraphGraphQLAPIClient.withStaticConfig({
        auth: {
            credentials: { token: 'test-token' },
            serverEndpoint: 'https://test.sourcegraph.com',
        },
        clientState: { anonymousUserID: 'a' },
        configuration: {
            telemetryLevel: 'off',
        },
    })

    describe('fetchHTTP', () => {
        it('sets Accept header', async () => {
            const fetchMock = vi
                .spyOn(fetchModule, 'fetch')
                .mockImplementation(async () =>
                    Promise.resolve(new Response(JSON.stringify({ data: {} }), { status: 200 }))
                )
            await client.fetchHTTP('TestQuery', 'POST', '/graphql', '{}')

            expect(fetchMock).toHaveBeenCalled()
            const headers = fetchMock.mock.calls[0][1]?.headers as Headers
            expect(headers.get('Accept')).toBe('application/json')

            fetchMock.mockRestore()
        })
    })

    describe('getCurrentUserInfo', () => {
        it('returns NeedsAuthChallengeError when response requires auth challenge', async () => {
            const fetchMock = vi.spyOn(fetchModule, 'fetch').mockImplementation(async () =>
                Promise.resolve(
                    new Response(null, {
                        status: 401,
                        headers: new Headers({
                            'X-CustomerName-U2f-Challenge': 'true',
                        }),
                    })
                )
            )
            const result = await client.getCurrentUserInfo()
            expect(fetchMock).toHaveBeenCalled()
            console.log('XX', result)
            expect(result).toBeInstanceOf(NeedsAuthChallengeError)
        })
    })
})
