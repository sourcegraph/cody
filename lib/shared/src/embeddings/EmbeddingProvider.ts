import { createHash } from 'crypto'

import fetch from 'node-fetch'

// Embeds text and returns a vector of numbers which abstractly represent the
// text. Note, the codebase causally uses "embeddings" to refer to context
// sourced by searching a database of embeddings. This interface is for
// generating a single embedding.
export interface EmbeddingProvider {
    // Describes the embedding model, for example "openai/text-embedding-ada-002".
    model: string
    // The size of embedding vectors.
    dimensions: number
    // Generates an embedding for the specified string.
    embed(query: string): Promise<EmbeddingResult>
    // Generates embeddings for all of the specified strings.
    embedMultiple(queries: string[]): Promise<EmbeddingMultiResult>
}

// TODO(dpc): When we start embedding queries and indexing repositories,
// consider adding an "intent" (query, document) to the embedding and port these
// model-specific transformations:
// https://github.com/sourcegraph/sourcegraph/pull/54302

export interface EmbeddingSuccess {
    type: 'success'
    vector: number[]
}

export interface EmbeddingFailure {
    type: 'failure'
    message: string
}

export interface EmbeddingMultiSuccess {
    type: 'success-multi'
    model: string
    vectors: number[][]
}

export type EmbeddingResult = EmbeddingSuccess | EmbeddingFailure

export type EmbeddingMultiResult = EmbeddingMultiSuccess | EmbeddingFailure

export const CODY_GATEWAY_EMBEDDINGS_API_ENDPOINT = 'https://cody-gateway.sourcegraph.com/v1/embeddings'

// sgp_ ... 20 hex encoded bytes => sdg_ ... 2 rounds SHA256 of access token
export function accessTokenToGatewayToken(accessToken: string): string {
    const match = accessToken.match(/^sgp_([\dA-Fa-f]{40})$/)
    if (!match) {
        throw new Error('access token has invalid format')
    }
    const buffer = match[1]
    const round1 = createHash('sha256').update(buffer, 'hex').digest()
    const round2 = createHash('sha256').update(round1).digest('hex')
    return `sgd_${round2}`
}

// See sourcegraph/sourcegraph internal/embeddings/embed/client/sourcegraph/client.go
export class CodyGatewayEmbeddingProvider implements EmbeddingProvider {
    constructor(
        public readonly endpoint: string,
        private readonly gatewayAccessToken: string
    ) {
        if (/^sgd_[\dA-Fa-f]{32}$/.test(gatewayAccessToken)) {
            throw new Error('Cody Gateway tokens start with sgd_ see accessTokenToGatewayToken')
        }
    }

    public get model(): string {
        return 'openai/text-embedding-ada-002'
    }

    public get dimensions(): number {
        return 1536
    }

    public async embed(query: string): Promise<EmbeddingResult> {
        const result = await this.embedMultiple([query])
        if (result.type === 'success-multi') {
            return {
                type: 'success',
                vector: result.vectors[0],
            }
        }
        return result
    }

    public async embedMultiple(queries: string[]): Promise<EmbeddingMultiResult> {
        // TODO(dpc): Implement HTTP keepalive when we start embedding multiple chunks from a repository
        // https://stackoverflow.com/questions/62500011/reuse-tcp-connection-with-node-fetch-in-node-js
        //
        // curl -vv https://cody-gateway.sourcegraph.com/v1/embeddings -H 'Authorization: bearer sgd_mumble' -H 'content-type: application/json' --data-raw '{"model":"openai/text-embedding-ada-002","input":["hello, world"]}'
        // response like:
        // {embeddings: [{index: 0, data: [...]},...], model: "text-embedding-ada-002-v2", dimensions: 1536}
        const response = await fetch(this.endpoint, {
            method: 'post',
            body: JSON.stringify({ model: this.model, input: queries }),
            headers: {
                authorization: `bearer ${this.gatewayAccessToken}`,
                'content-type': 'application/json',
            },
        })
        let json
        try {
            json = await response.json()
        } catch (error) {
            return {
                type: 'failure',
                message: `Cody Gateway responded ${response.status}: ${response.statusText}; could not parse JSON response body: ${error}`,
            }
        }
        if (response.status === 200 && isCodyGatewayEmbeddingsResponseJson(json)) {
            if (json.dimensions !== this.dimensions) {
                return {
                    type: 'failure',
                    message: `model "${json.model}" returned ${json.dimensions}-vector but expected "${this.model}" with ${this.dimensions}-vector (dimensions must match)`,
                }
            }
            const vectors = []
            for (const { index, data } of json.embeddings) {
                vectors[index] = data
            }
            return {
                type: 'success-multi',
                model: json.model,
                vectors,
            }
        }
        if (isCodyGatewayEmbeddingsErrorJson(json)) {
            return {
                type: 'failure',
                message: json.error,
            }
        }
        return {
            type: 'failure',
            message: `Error fetching ${this.endpoint} ${response.status}: ${response.statusText}`,
        }
    }
}

interface CodyGatewayEmbeddingsResponseJson {
    model: string
    dimensions: number
    embeddings: [{ index: number; data: number[] }]
}

function isCodyGatewayEmbeddingsResponseJson(obj: unknown): obj is CodyGatewayEmbeddingsResponseJson {
    return (
        obj !== null &&
        typeof obj === 'object' &&
        'model' in obj &&
        typeof obj.model === 'string' &&
        'dimensions' in obj &&
        typeof obj.dimensions === 'number' &&
        obj.dimensions >= 0 &&
        'embeddings' in obj &&
        Array.isArray(obj.embeddings)
    )
}

interface CodyGatewayEmbeddingsErrorJson {
    error: string
}

function isCodyGatewayEmbeddingsErrorJson(obj: unknown): obj is CodyGatewayEmbeddingsErrorJson {
    return obj !== null && typeof obj === 'object' && 'error' in obj && typeof obj.error === 'string'
}
