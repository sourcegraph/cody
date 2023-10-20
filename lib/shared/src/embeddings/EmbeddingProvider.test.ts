import * as mockttp from 'mockttp'
import { assert, describe, expect, it } from 'vitest'

import {
    accessTokenToGatewayToken,
    CODY_GATEWAY_EMBEDDINGS_API_ENDPOINT,
    CodyGatewayEmbeddingProvider,
} from './EmbeddingProvider'

describe('accessTokenToGatewayToken', () => {
    it('throws if given an invalid token', () => {
        expect(() => accessTokenToGatewayToken('sad_123456789012345678901234567890123456789f')).toThrow()
        expect(() => accessTokenToGatewayToken('sgp_123456789g123456789012345678901234567890')).toThrow()
        expect(() => accessTokenToGatewayToken('sgp_12345678901234567890123456789012345678901')).toThrow()
        expect(() => accessTokenToGatewayToken('hello, world')).toThrow()
    })
    it('computes gateway tokens from access tokens', () => {
        expect(accessTokenToGatewayToken('sgp_0000000000000000000000000000000000000000')).toEqual(
            'sgd_f6eab7b91a423426d06da844347472994a738cc6b105c5fa695f74832818d173'
        )
    })
})

// Gets and starts a local server. Mockttp will self-assign ports, but tests
// fail if a Mockttp server re-uses the same port. This assigns them different
// dynamic ports.
async function startLocalServer(): Promise<mockttp.Mockttp> {
    const server = mockttp.getLocal()
    await server.start({ startPort: startLocalServer.lastPort + 1, endPort: 65535 })
    startLocalServer.lastPort = server.port
    return server
}
startLocalServer.lastPort = 0

function fakeVector(length: number, id?: number): number[] {
    const vector = []
    for (let i = 0; i < length; i++) {
        vector[i] = (id || 0) + 2 * i
    }
    return vector
}

describe('CodyGatewayEmbeddingProvider', () => {
    it('reports application level errors', async () => {
        const server = await startLocalServer()

        await server.forPost('/api/embeddings').thenReply(400, JSON.stringify({ error: 'bad things happened' }))

        const provider = new CodyGatewayEmbeddingProvider(
            server.urlFor('/api/embeddings'),
            'sgd_0000000000000000000000000000000000000000'
        )

        const result = await provider.embed('hello, world')
        assert(result.type === 'failure')
        expect(result.message).toBe('bad things happened')
        await server.stop()
    })

    it('fails if the embedding dimension is different', async () => {
        const server = await startLocalServer()

        await server
            .forPost('/api/embeddings')
            .thenReply(
                200,
                JSON.stringify({ model: 'foo', dimensions: 768, embeddings: [{ index: 0, data: fakeVector(768) }] })
            )

        const provider = new CodyGatewayEmbeddingProvider(
            server.urlFor('/api/embeddings'),
            'sgd_0000000000000000000000000000000000000000'
        )

        const result = await provider.embed('hello, world')

        assert(result.type === 'failure')
        expect(result.message).toContain('dimensions must match')
        await server.stop()
    })

    it('does single embeddings', async () => {
        const server = await startLocalServer()
        const endpoint = await server
            .forPost('/api/embeddings')
            .thenReply(
                200,
                JSON.stringify({ model: 'foo', dimensions: 1536, embeddings: [{ index: 0, data: fakeVector(1536) }] })
            )

        const provider = new CodyGatewayEmbeddingProvider(
            server.urlFor('/api/embeddings'),
            'sgd_0000000000000000000000000000000000000000'
        )

        const result = await provider.embed('hello, world')

        const requests = await endpoint.getSeenRequests()
        expect(requests.length).toBe(1)
        const [request] = requests
        expect(request.headers.authorization).toBe('bearer sgd_0000000000000000000000000000000000000000')

        assert(result.type === 'success')
        expect(result.vector.length).toBe(1536)
        expect(result.vector[0]).toBe(0)
        expect(result.vector[1535]).toBe(3070)
        await server.stop()
    })

    it('does multiple embeddings', async () => {
        const server = await startLocalServer()
        await server.forPost('/api/embeddings').thenReply(
            200,
            JSON.stringify({
                model: 'foo',
                dimensions: 1536,
                embeddings: [
                    // Note, these are returned out of order.
                    { index: 1, data: fakeVector(1536, 1) },
                    { index: 0, data: fakeVector(1536, 0) },
                ],
            })
        )

        const provider = new CodyGatewayEmbeddingProvider(
            server.urlFor('/api/embeddings'),
            'sgd_0000000000000000000000000000000000000000'
        )

        const result = await provider.embedMultiple(['hello, world', 'goodbye, world'])

        assert(result.type === 'success-multi')
        expect(result.vectors.length).toBe(2)
        expect(result.vectors[0][0]).toBe(0)
        expect(result.vectors[1][0]).toBe(1)
        expect(result.vectors[1][1535]).toBe(3071)
        await server.stop()
    })

    // This test demonstrates that CodyGatewayEmbeddingProvider can call the
    // production embeddings frontend. You need to run the tests with the
    // SOURCEGRAPH_DOTCOM_TOKEN environment variable set.
    it('works with the production frontend (if token available)', async () => {
        const accessToken = process.env.SOURCEGRAPH_DOTCOM_TOKEN
        if (!accessToken) {
            console.log('SOURCEGRAPH_DOTCOM_TOKEN not set, skipping')
            return
        }
        const provider = new CodyGatewayEmbeddingProvider(
            CODY_GATEWAY_EMBEDDINGS_API_ENDPOINT,
            accessTokenToGatewayToken(accessToken)
        )
        const result = await provider.embedMultiple([
            'hello, world',
            'hello, world',
            'killer whales are the apex predator of the oceans',
        ])
        console.log(result)
        assert(result.type === 'success-multi')
        expect(result.model).toBe('text-embedding-ada-002-v2')
        expect(result.vectors.length).toBe(3)
        for (const vector of result.vectors) {
            expect(vector.length).toBe(1536)
        }
        // Interestingly, this assertion often fails is the O(1e-3) magnitude.
        for (let i = 0; i < 1536; i++) {
            expect(result.vectors[0][i], `item ${i}`).toEqual(result.vectors[1][i])
        }
        expect(result.vectors[2][0]).not.toEqual(0)
    })
})
